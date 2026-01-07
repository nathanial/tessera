/**
 * Terrain Tile Manager
 *
 * Handles loading, caching, and managing Cesium terrain tiles.
 */

import {
  type TerrainTileData,
  type TileCoord,
  parseQuantizedMesh,
  tileToMercatorBounds,
  quantizedHeightToWorld,
} from "./TerrainTileLoader";

/** Built mesh data ready for GPU upload */
export interface TerrainMeshData {
  /** Vertex buffer: [x, y, z, u, v] per vertex (5 floats) */
  vertices: Float32Array;
  /** Triangle indices (Uint16 for small meshes, Uint32 for large) */
  indices: Uint16Array | Uint32Array;
  /** Minimum height in world units */
  minHeight: number;
  /** Maximum height in world units */
  maxHeight: number;
  /** Tile coordinate */
  coord: TileCoord;
  /** Mercator bounds for positioning */
  bounds: { west: number; south: number; east: number; north: number };
}

/** Cache entry for a terrain tile */
interface CacheEntry {
  data: TerrainMeshData;
  lastUsed: number;
}

/** Failed tile entry with retry time */
interface FailedEntry {
  retryAfter: number;
}

export class TerrainTileManager {
  /** Cesium Ion access token */
  private accessToken: string;

  /** Asset ID for terrain (1 = Cesium World Terrain) */
  private assetId: number;

  /** Endpoint URL (resolved from Cesium Ion) */
  private endpoint: string | null = null;

  /** Short-lived access token for tile requests (from endpoint response) */
  private tileAccessToken: string | null = null;

  /** Promise for initialization (to prevent duplicate calls) */
  private initPromise: Promise<void> | null = null;

  /** Tile cache */
  private cache = new Map<string, CacheEntry>();

  /** Tiles currently loading */
  private loading = new Map<string, Promise<TerrainMeshData | null>>();

  /** Failed tiles with retry cooldown */
  private failed = new Map<string, FailedEntry>();

  /** Tiles that have been requested (prevents duplicate requests) */
  private requested = new Set<string>();

  /** Queue of tiles waiting to load */
  private queue: TileCoord[] = [];

  /** Callback when a tile finishes loading */
  private onTileLoaded?: () => void;

  /** Retry cooldown in milliseconds */
  private retryCooldown = 30000; // 30 seconds

  /** Maximum cache size */
  private maxCacheSize = 100;

  /** Maximum concurrent tile requests */
  private maxConcurrentRequests = 4;

  /** Current number of active requests */
  private activeRequests = 0;

  /** Maximum terrain zoom level to load (for low-res terrain) */
  readonly maxTerrainZoom = 8;

  /** Minimum terrain zoom level */
  readonly minTerrainZoom = 0;

  constructor(accessToken: string, assetId: number = 1, onTileLoaded?: () => void) {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error(
        "Cesium access token is required. Get a free token at https://ion.cesium.com/ " +
        "and set VITE_CESIUM_TOKEN in your .env.local file."
      );
    }
    this.accessToken = accessToken;
    this.assetId = assetId;
    this.onTileLoaded = onTileLoaded;
  }

  /** Initialize by fetching the terrain endpoint from Cesium Ion */
  async initialize(): Promise<void> {
    if (this.endpoint) return;

    // Return existing promise if already initializing
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const response = await fetch(
      `https://api.cesium.com/v1/assets/${this.assetId}/endpoint`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      this.initPromise = null; // Allow retry on failure
      throw new Error(`Failed to get Cesium Ion endpoint: ${response.status}`);
    }

    const data = await response.json();
    this.endpoint = data.url;
    this.tileAccessToken = data.accessToken;
  }

  /** Generate cache key for a tile */
  private getCacheKey(coord: TileCoord): string {
    return `${coord.z}/${coord.x}/${coord.y}`;
  }

  /** Check if a tile failed recently and is still in cooldown */
  private isFailedRecently(key: string): boolean {
    const failedEntry = this.failed.get(key);
    if (failedEntry && Date.now() < failedEntry.retryAfter) {
      return true;
    }
    // Clean up expired failure entry
    if (failedEntry) {
      this.failed.delete(key);
    }
    return false;
  }

  /**
   * Request a tile to be loaded (non-blocking).
   * Call this from the render loop - it will queue the tile for loading
   * without starting a network request every frame.
   */
  requestTile(coord: TileCoord): void {
    const clampedCoord = this.clampToMaxZoom(coord);
    const key = this.getCacheKey(clampedCoord);

    // Skip if already cached, loading, requested, or recently failed
    if (
      this.cache.has(key) ||
      this.loading.has(key) ||
      this.requested.has(key) ||
      this.isFailedRecently(key)
    ) {
      return;
    }

    // Mark as requested and add to queue
    this.requested.add(key);
    this.queue.push(clampedCoord);
    this.processQueue();
  }

  /** Process the load queue, starting loads up to the concurrent limit */
  private processQueue(): void {
    while (
      this.queue.length > 0 &&
      this.activeRequests < this.maxConcurrentRequests
    ) {
      const coord = this.queue.shift()!;
      this.startLoad(coord);
    }
  }

  /** Start loading a tile (internal - respects queue system) */
  private startLoad(coord: TileCoord): void {
    const key = this.getCacheKey(coord);
    this.activeRequests++;

    const promise = this.loadTile(coord);
    this.loading.set(key, promise);

    promise
      .then((data) => {
        if (data) {
          this.cache.set(key, { data, lastUsed: Date.now() });
          this.failed.delete(key);
          this.evictIfNeeded();
          this.onTileLoaded?.(); // Notify to re-render
        } else {
          this.failed.set(key, { retryAfter: Date.now() + this.retryCooldown });
        }
      })
      .catch((error) => {
        console.warn(`Error loading terrain tile ${key}:`, error);
        this.failed.set(key, { retryAfter: Date.now() + this.retryCooldown });
      })
      .finally(() => {
        this.activeRequests--;
        this.loading.delete(key);
        this.requested.delete(key);
        this.processQueue(); // Process next queued tile
      });
  }

  /** Clamp tile coordinate to max terrain zoom */
  private clampToMaxZoom(coord: TileCoord): TileCoord {
    if (coord.z <= this.maxTerrainZoom) {
      return coord;
    }

    const diff = coord.z - this.maxTerrainZoom;
    const scale = Math.pow(2, diff);
    return {
      z: this.maxTerrainZoom,
      x: Math.floor(coord.x / scale),
      y: Math.floor(coord.y / scale),
    };
  }

  /** Load a terrain tile from Cesium Ion */
  private async loadTile(coord: TileCoord): Promise<TerrainMeshData | null> {
    if (!this.endpoint) {
      await this.initialize();
    }

    try {
      // Cesium terrain uses TMS Y coordinate (flipped)
      const tmsY = Math.pow(2, coord.z) - 1 - coord.y;

      const url = `${this.endpoint}${coord.z}/${coord.x}/${tmsY}.terrain?v=1.2.0`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.quantized-mesh,application/octet-stream;q=0.9",
          Authorization: `Bearer ${this.tileAccessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No terrain data for this tile (e.g., ocean)
          return this.createFlatTile(coord);
        }
        console.warn(`Failed to load terrain tile ${coord.z}/${coord.x}/${coord.y}: ${response.status}`);
        return null;
      }

      const buffer = await response.arrayBuffer();
      const tileData = parseQuantizedMesh(buffer);

      return this.buildMesh(tileData, coord);
    } catch (error) {
      console.warn(`Error loading terrain tile ${coord.z}/${coord.x}/${coord.y}:`, error);
      return null;
    }
  }

  /** Create a flat tile for areas with no terrain data */
  private createFlatTile(coord: TileCoord): TerrainMeshData {
    const bounds = tileToMercatorBounds(coord);

    // Simple 2x2 grid (4 vertices, 2 triangles)
    const vertices = new Float32Array([
      // x, y, z, u, v
      bounds.west, bounds.south, 0, 0, 0,
      bounds.east, bounds.south, 0, 1, 0,
      bounds.west, bounds.north, 0, 0, 1,
      bounds.east, bounds.north, 0, 1, 1,
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      1, 3, 2,
    ]);

    return {
      vertices,
      indices,
      minHeight: 0,
      maxHeight: 0,
      coord,
      bounds,
    };
  }

  /** Build renderable mesh from parsed tile data */
  private buildMesh(data: TerrainTileData, coord: TileCoord): TerrainMeshData {
    const bounds = tileToMercatorBounds(coord);
    const { header, vertexCount, u, v, height, indices: srcIndices } = data;

    // Validate indices are within vertex count
    let maxIndex = 0;
    for (let i = 0; i < srcIndices.length; i++) {
      const idx = srcIndices[i]!;
      if (idx >= vertexCount) {
        console.error(`[TerrainTileManager] Invalid index ${idx} >= vertexCount ${vertexCount} in tile ${coord.z}/${coord.x}/${coord.y}`);
        // Return a flat tile instead of corrupted data
        return this.createFlatTile(coord);
      }
      if (idx > maxIndex) maxIndex = idx;
    }

    // Build vertex buffer: [x, y, z, u, v] per vertex
    const vertices = new Float32Array(vertexCount * 5);

    const tileWidth = bounds.east - bounds.west;
    const tileHeight = bounds.north - bounds.south;

    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      // Quantized values are 0-32767
      const uNorm = u[i]! / 32767;
      const vNorm = v[i]! / 32767;

      // World position
      const x = bounds.west + uNorm * tileWidth;
      const y = bounds.south + vNorm * tileHeight;
      const z = quantizedHeightToWorld(
        height[i]!,
        header.minimumHeight,
        header.maximumHeight
      );

      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);

      const idx = i * 5;
      vertices[idx] = x;
      vertices[idx + 1] = y;
      vertices[idx + 2] = z;
      vertices[idx + 3] = uNorm; // Texture U
      vertices[idx + 4] = vNorm; // Texture V
    }

    // Keep original index type (Uint16Array for small meshes, Uint32Array for large)
    // This must match what WebGL expects based on the array type
    const indices = srcIndices instanceof Uint32Array
      ? new Uint32Array(srcIndices)
      : new Uint16Array(srcIndices);

    return {
      vertices,
      indices,
      minHeight: minZ,
      maxHeight: maxZ,
      coord,
      bounds,
    };
  }

  /** Evict old entries if cache is full */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxCacheSize) return;

    // Find and remove least recently used entries
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /** Get all visible terrain tiles for a given camera view */
  getVisibleTiles(
    bounds: { left: number; right: number; top: number; bottom: number },
    _zoom: number // Ignored - we calculate zoom from bounds
  ): TileCoord[] {
    // Calculate appropriate terrain zoom based on bounds size
    // We want roughly 3-6 tiles across the visible area
    const boundsWidth = Math.abs(bounds.right - bounds.left);
    const boundsHeight = Math.abs(bounds.bottom - bounds.top);
    const maxDimension = Math.max(boundsWidth, boundsHeight);

    // Prevent division by zero or tiny bounds
    if (maxDimension < 0.0001) {
      return [];
    }

    // At zoom N, each tile covers 1/2^N of the world
    // We want ~4 tiles across, so: 4 * tileSize = maxDimension
    // tileSize = 1/2^N, so: 4 / 2^N = maxDimension => 2^N = 4 / maxDimension
    const targetTilesAcross = 4;
    const idealZoom = Math.log2(targetTilesAcross / maxDimension);
    const terrainZoom = Math.max(
      this.minTerrainZoom,
      Math.min(Math.floor(idealZoom), this.maxTerrainZoom)
    );

    const scale = Math.pow(2, terrainZoom);
    const tiles: TileCoord[] = [];

    const minX = Math.max(0, Math.floor(bounds.left * scale));
    const maxX = Math.min(scale - 1, Math.floor(bounds.right * scale));
    const minY = Math.max(0, Math.floor(bounds.top * scale));
    const maxY = Math.min(scale - 1, Math.floor(bounds.bottom * scale));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        tiles.push({ z: terrainZoom, x, y });
      }
    }

    return tiles;
  }

  /** Check if a tile is loaded */
  hasTile(coord: TileCoord): boolean {
    const clampedCoord = this.clampToMaxZoom(coord);
    return this.cache.has(this.getCacheKey(clampedCoord));
  }

  /** Get cached tile data (returns null if not cached) */
  getCachedTile(coord: TileCoord): TerrainMeshData | null {
    const clampedCoord = this.clampToMaxZoom(coord);
    const cached = this.cache.get(this.getCacheKey(clampedCoord));
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.data;
    }
    return null;
  }

  /** Clear the cache */
  clearCache(): void {
    this.cache.clear();
  }
}
