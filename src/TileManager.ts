/**
 * Tile loading and texture management
 */

import { TILE_SIZE } from "./constants";
import { getViewMetrics } from "./view";

export interface TileCoord {
  z: number;
  /** Wrapped X coordinate for texture lookup (0 to 2^z - 1) */
  x: number;
  y: number;
  /** Unwrapped X coordinate for world positioning (can be negative or >= 2^z) */
  worldX: number;
}

export interface LoadedTile {
  coord: TileCoord;
  texture: WebGLTexture;
}

/** Result from getTileWithFallback - includes UV mapping for fallback tiles */
export interface FallbackTile {
  texture: WebGLTexture;
  /** UV offset for sampling (0,0 for exact tile, non-zero for fallback) */
  uvOffset: [number, number];
  /** UV scale for sampling (1.0 for exact tile, <1.0 for fallback) */
  uvScale: number;
  /** Whether this is the exact requested tile or a fallback */
  isExact: boolean;
}

interface CacheEntry {
  texture: WebGLTexture;
  lastUsed: number;
  /** Zoom level - used to protect base tiles from eviction */
  zoom: number;
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
    // Preload base tiles so we always have a fallback
    this.preloadBaseTiles();
  }

  /** Preload zoom 0 and zoom 1 tiles for fallback coverage */
  private preloadBaseTiles(): void {
    // Zoom 0: 1 tile (entire world)
    this.getTile(0, 0, 0);
    // Zoom 1: 4 tiles (2x2 grid)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        this.getTile(1, x, y);
      }
    }
  }

  /** Get cache key for a tile coordinate */
  private getKey(z: number, x: number, y: number): string {
    return `${z}/${x}/${y}`;
  }

  /** Carto subdomains for load balancing */
  private static readonly SUBDOMAINS = ["a", "b", "c", "d"];

  /** Get Carto Dark retina tile URL */
  private getTileUrl(z: number, x: number, y: number): string {
    // Round-robin through subdomains based on tile coords
    const subdomain = TileManager.SUBDOMAINS[(x + y) % TileManager.SUBDOMAINS.length]!;
    return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/dark_all/${z}/${x}/${y}@2x.png`;
  }

  /** Tile size in CSS pixels (512 for @2x retina tiles) */
  static readonly TILE_SIZE = TILE_SIZE;

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
    const { viewWidth, viewHeight } = getViewMetrics(
      zoom,
      viewportWidth,
      viewportHeight
    );

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
          tiles.push({ z: tileZoom, x: wrappedX, y, worldX: x });
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

  /**
   * Get a tile texture with fallback to parent tiles.
   * If the exact tile isn't loaded, returns the closest loaded ancestor
   * with UV coordinates to sample the correct portion.
   */
  getTileWithFallback(z: number, x: number, y: number): FallbackTile | null {
    const key = this.getKey(z, x, y);

    // Check if exact tile is cached
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return {
        texture: cached.texture,
        uvOffset: [0, 0],
        uvScale: 1,
        isExact: true,
      };
    }

    // Start loading the exact tile if not already loading
    if (!this.loading.has(key)) {
      this.loading.set(key, this.loadTile(z, x, y));
    }

    // Walk up the tile hierarchy to find a loaded parent
    let tz = z;
    let tx = x;
    let ty = y;

    while (tz > 0) {
      tz--;
      tx = Math.floor(tx / 2);
      ty = Math.floor(ty / 2);

      const parentKey = this.getKey(tz, tx, ty);
      const parent = this.cache.get(parentKey);

      if (parent) {
        parent.lastUsed = Date.now();

        // Calculate UV offset and scale for sampling the correct portion
        const zoomDiff = z - tz;
        const divisor = Math.pow(2, zoomDiff);
        const scale = 1 / divisor;

        // Calculate which portion of the parent tile we need
        const localX = x % divisor;
        const localY = y % divisor;
        const uvOffsetX = localX * scale;
        const uvOffsetY = localY * scale;

        return {
          texture: parent.texture,
          uvOffset: [uvOffsetX, uvOffsetY],
          uvScale: scale,
          isExact: false,
        };
      }
    }

    // No fallback found (shouldn't happen after base tiles are loaded)
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

      // Add to cache (include zoom for eviction protection)
      this.cache.set(key, { texture, lastUsed: Date.now(), zoom: z });
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

  /** Remove least recently used tiles from cache (protects base tiles) */
  private evictOldTiles(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Filter out base tiles (z <= 1) - they must never be evicted
    const entries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.zoom > 1);

    // Sort by last used time
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
