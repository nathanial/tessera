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
  /** Triangle indices */
  indices: Uint32Array;
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

export class TerrainTileManager {
  /** Cesium Ion access token */
  private accessToken: string;

  /** Asset ID for terrain (1 = Cesium World Terrain) */
  private assetId: number;

  /** Endpoint URL (resolved from Cesium Ion) */
  private endpoint: string | null = null;

  /** Tile cache */
  private cache = new Map<string, CacheEntry>();

  /** Tiles currently loading */
  private loading = new Map<string, Promise<TerrainMeshData | null>>();

  /** Maximum cache size */
  private maxCacheSize = 100;

  /** Maximum terrain zoom level to load (for low-res terrain) */
  readonly maxTerrainZoom = 8;

  /** Minimum terrain zoom level */
  readonly minTerrainZoom = 0;

  constructor(accessToken: string, assetId: number = 1) {
    this.accessToken = accessToken;
    this.assetId = assetId;
  }

  /** Initialize by fetching the terrain endpoint from Cesium Ion */
  async initialize(): Promise<void> {
    if (this.endpoint) return;

    const response = await fetch(
      `https://api.cesium.com/v1/assets/${this.assetId}/endpoint`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Cesium Ion endpoint: ${response.status}`);
    }

    const data = await response.json();
    this.endpoint = data.url;
  }

  /** Generate cache key for a tile */
  private getCacheKey(coord: TileCoord): string {
    return `${coord.z}/${coord.x}/${coord.y}`;
  }

  /** Get terrain tile, loading if necessary */
  async getTile(coord: TileCoord): Promise<TerrainMeshData | null> {
    // Clamp to max terrain zoom
    const clampedCoord = this.clampToMaxZoom(coord);
    const key = this.getCacheKey(clampedCoord);

    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.data;
    }

    // Check if already loading
    const loading = this.loading.get(key);
    if (loading) {
      return loading;
    }

    // Start loading
    const promise = this.loadTile(clampedCoord);
    this.loading.set(key, promise);

    try {
      const data = await promise;
      if (data) {
        this.cache.set(key, { data, lastUsed: Date.now() });
        this.evictIfNeeded();
      }
      return data;
    } finally {
      this.loading.delete(key);
    }
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
          Authorization: `Bearer ${this.accessToken}`,
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

    const indices = new Uint32Array([
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

    // Copy indices to Uint32Array
    const indices = new Uint32Array(srcIndices.length);
    for (let i = 0; i < srcIndices.length; i++) {
      indices[i] = srcIndices[i]!;
    }

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
    zoom: number
  ): TileCoord[] {
    // Use lower terrain zoom (clamped to max)
    const terrainZoom = Math.min(Math.floor(zoom), this.maxTerrainZoom);
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
