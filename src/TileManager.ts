/**
 * Tile loading and texture management
 */

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface LoadedTile {
  coord: TileCoord;
  texture: WebGLTexture;
}

interface CacheEntry {
  texture: WebGLTexture;
  lastUsed: number;
}

export class TileManager {
  private gl: WebGL2RenderingContext;
  private cache = new Map<string, CacheEntry>();
  private loading = new Map<string, Promise<WebGLTexture | null>>();
  private maxCacheSize = 128;
  private onTileLoaded?: () => void;

  constructor(gl: WebGL2RenderingContext, onTileLoaded?: () => void) {
    this.gl = gl;
    this.onTileLoaded = onTileLoaded;
  }

  /** Get cache key for a tile coordinate */
  private getKey(z: number, x: number, y: number): string {
    return `${z}/${x}/${y}`;
  }

  /** Get OSM tile URL */
  private getTileUrl(z: number, x: number, y: number): string {
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }

  /** Tile size in CSS pixels (standard for web maps) */
  static readonly TILE_SIZE = 256;

  /** Get visible tile coordinates for the current view */
  getVisibleTiles(
    centerX: number,
    centerY: number,
    zoom: number,
    viewportWidth: number,
    viewportHeight: number
  ): TileCoord[] {
    const tileZoom = Math.floor(zoom);
    const numTiles = Math.pow(2, tileZoom);

    // View size in world coordinates (0-1 range)
    // At zoom N, world is TILE_SIZE * 2^N pixels
    const worldSizeInPixels = TileManager.TILE_SIZE * Math.pow(2, zoom);
    const viewWidth = viewportWidth / worldSizeInPixels;
    const viewHeight = viewportHeight / worldSizeInPixels;

    // View bounds in world coordinates
    const left = centerX - viewWidth / 2;
    const right = centerX + viewWidth / 2;
    const top = centerY - viewHeight / 2;
    const bottom = centerY + viewHeight / 2;

    // Convert to tile coordinates
    const minTileX = Math.floor(left * numTiles);
    const maxTileX = Math.floor(right * numTiles);
    const minTileY = Math.floor(top * numTiles);
    const maxTileY = Math.floor(bottom * numTiles);

    const tiles: TileCoord[] = [];

    for (let y = minTileY; y <= maxTileY; y++) {
      for (let x = minTileX; x <= maxTileX; x++) {
        // Wrap X coordinate (world wraps horizontally)
        const wrappedX = ((x % numTiles) + numTiles) % numTiles;
        // Clamp Y coordinate (no vertical wrapping)
        if (y >= 0 && y < numTiles) {
          tiles.push({ z: tileZoom, x: wrappedX, y });
        }
      }
    }

    return tiles;
  }

  /** Get a tile texture, loading it if necessary */
  getTile(z: number, x: number, y: number): WebGLTexture | null {
    const key = this.getKey(z, x, y);

    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.texture;
    }

    // Start loading if not already
    if (!this.loading.has(key)) {
      this.loading.set(key, this.loadTile(z, x, y));
    }

    return null;
  }

  /** Load a tile and create a texture */
  private async loadTile(z: number, x: number, y: number): Promise<WebGLTexture | null> {
    const key = this.getKey(z, x, y);
    const url = this.getTileUrl(z, x, y);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
        img.src = url;
      });

      // Create texture
      const gl = this.gl;
      const texture = gl.createTexture();
      if (!texture) {
        throw new Error("Failed to create texture");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Add to cache
      this.cache.set(key, { texture, lastUsed: Date.now() });
      this.loading.delete(key);

      // Evict old tiles if cache is too large
      this.evictOldTiles();

      // Notify that a tile is ready
      this.onTileLoaded?.();

      return texture;
    } catch (error) {
      console.error(error);
      this.loading.delete(key);
      return null;
    }
  }

  /** Remove least recently used tiles from cache */
  private evictOldTiles(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Sort by last used time
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    // Remove oldest until under limit
    const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
    for (const [key, entry] of toRemove) {
      this.gl.deleteTexture(entry.texture);
      this.cache.delete(key);
    }
  }

  /** Clean up all resources */
  destroy(): void {
    for (const entry of this.cache.values()) {
      this.gl.deleteTexture(entry.texture);
    }
    this.cache.clear();
    this.loading.clear();
  }
}
