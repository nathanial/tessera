/**
 * GPU Terrain Mesh
 *
 * Represents a terrain tile mesh ready for WebGL rendering.
 */

import { Geometry } from "../Geometry";
import type { TerrainMeshData } from "./TerrainTileManager";
import type { TileCoord } from "./TerrainTileLoader";

export class TerrainMesh {
  readonly gl: WebGL2RenderingContext;
  readonly geometry: Geometry;
  readonly coord: TileCoord;
  readonly bounds: { west: number; south: number; east: number; north: number };
  readonly minHeight: number;
  readonly maxHeight: number;

  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext, data: TerrainMeshData) {
    this.gl = gl;
    this.coord = data.coord;
    this.bounds = data.bounds;
    this.minHeight = data.minHeight;
    this.maxHeight = data.maxHeight;

    // Create geometry with vertex layout:
    // [x, y, z, u, v] = 5 floats per vertex = 20 bytes stride
    this.geometry = new Geometry(gl, {
      vertices: data.vertices,
      indices: data.indices,
      attributes: [
        {
          location: 0, // a_position (vec3)
          size: 3,
          stride: 20,
          offset: 0,
        },
        {
          location: 1, // a_texCoord (vec2)
          size: 2,
          stride: 20,
          offset: 12, // 3 floats * 4 bytes
        },
      ],
    });
  }

  /** Bind the terrain mesh for rendering */
  bind(): void {
    if (this._destroyed) {
      throw new Error("Cannot bind destroyed terrain mesh");
    }
    this.geometry.bind();
  }

  /** Draw the terrain mesh */
  draw(): void {
    if (this._destroyed) {
      throw new Error("Cannot draw destroyed terrain mesh");
    }
    this.geometry.draw();
  }

  /** Destroy the terrain mesh and free GPU resources */
  destroy(): void {
    if (this._destroyed) return;
    this.geometry.destroy();
    this._destroyed = true;
  }

  /** Check if the mesh has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }
}

/**
 * Terrain Mesh Cache
 *
 * Manages GPU terrain meshes, creating and destroying as needed.
 */
export class TerrainMeshCache {
  private gl: WebGL2RenderingContext;
  private meshes = new Map<string, TerrainMesh>();
  private maxSize = 50;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Get cache key for a tile */
  private getKey(coord: TileCoord): string {
    return `${coord.z}/${coord.x}/${coord.y}`;
  }

  /** Get or create a terrain mesh */
  getOrCreate(data: TerrainMeshData): TerrainMesh {
    const key = this.getKey(data.coord);

    let mesh = this.meshes.get(key);
    if (mesh && !mesh.destroyed) {
      return mesh;
    }

    // Create new mesh
    mesh = new TerrainMesh(this.gl, data);
    this.meshes.set(key, mesh);

    // Evict old meshes if needed
    this.evictIfNeeded();

    return mesh;
  }

  /** Check if a mesh exists for a tile */
  has(coord: TileCoord): boolean {
    const key = this.getKey(coord);
    const mesh = this.meshes.get(key);
    return mesh !== undefined && !mesh.destroyed;
  }

  /** Get a mesh if it exists */
  get(coord: TileCoord): TerrainMesh | undefined {
    const key = this.getKey(coord);
    const mesh = this.meshes.get(key);
    if (mesh && !mesh.destroyed) {
      return mesh;
    }
    return undefined;
  }

  /** Evict old meshes if cache is full */
  private evictIfNeeded(): void {
    if (this.meshes.size <= this.maxSize) return;

    // Simple eviction: remove oldest entries
    const toRemove = this.meshes.size - this.maxSize;
    let removed = 0;

    for (const [key, mesh] of this.meshes) {
      if (removed >= toRemove) break;
      mesh.destroy();
      this.meshes.delete(key);
      removed++;
    }
  }

  /** Clear all meshes */
  clear(): void {
    for (const mesh of this.meshes.values()) {
      mesh.destroy();
    }
    this.meshes.clear();
  }

  /** Destroy the cache and all meshes */
  destroy(): void {
    this.clear();
  }
}
