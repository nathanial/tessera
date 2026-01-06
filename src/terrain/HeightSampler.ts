/**
 * Height Sampler
 *
 * Provides terrain height queries at any world coordinate.
 * Uses bilinear interpolation within terrain triangles.
 */

import { TerrainTileManager, type TerrainMeshData } from "./TerrainTileManager";
import type { TileCoord } from "./TerrainTileLoader";
import type { Vec3 } from "../math/vec3";

export class HeightSampler {
  private terrainManager: TerrainTileManager;

  constructor(terrainManager: TerrainTileManager) {
    this.terrainManager = terrainManager;
  }

  /**
   * Sample terrain height at world coordinates.
   * Returns height in world units (z coordinate).
   * Returns 0 if terrain data is not available.
   */
  getHeightAt(worldX: number, worldY: number): number {
    // Find which terrain tile contains this point
    const zoom = this.terrainManager.maxTerrainZoom;
    const scale = Math.pow(2, zoom);

    const tileX = Math.floor(worldX * scale);
    const tileY = Math.floor(worldY * scale);

    const coord: TileCoord = {
      z: zoom,
      x: Math.max(0, Math.min(scale - 1, tileX)),
      y: Math.max(0, Math.min(scale - 1, tileY)),
    };

    // Get cached tile data
    const meshData = this.terrainManager.getCachedTile(coord);
    if (!meshData) {
      return 0; // No terrain data available
    }

    return this.sampleMesh(meshData, worldX, worldY);
  }

  /**
   * Sample heights for an array of positions.
   * More efficient than individual calls when sampling many points.
   */
  getHeightsAt(positions: Array<{ x: number; y: number }>): Float32Array {
    const heights = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i++) {
      heights[i] = this.getHeightAt(positions[i]!.x, positions[i]!.y);
    }

    return heights;
  }

  /**
   * Sample height within a terrain mesh using barycentric interpolation.
   */
  private sampleMesh(
    meshData: TerrainMeshData,
    worldX: number,
    worldY: number
  ): number {
    const { vertices, indices, bounds } = meshData;

    // Check if point is within tile bounds
    if (
      worldX < bounds.west ||
      worldX > bounds.east ||
      worldY < bounds.south ||
      worldY > bounds.north
    ) {
      return 0;
    }

    // Convert to tile-local UV (0-1)
    const u = (worldX - bounds.west) / (bounds.east - bounds.west);
    const v = (worldY - bounds.south) / (bounds.north - bounds.south);

    // Find the triangle containing this point and interpolate
    const triangleCount = indices.length / 3;

    for (let t = 0; t < triangleCount; t++) {
      const i0 = indices[t * 3]!;
      const i1 = indices[t * 3 + 1]!;
      const i2 = indices[t * 3 + 2]!;

      // Get vertex positions (x, y, z, u, v format - 5 floats per vertex)
      const x0 = vertices[i0 * 5]!;
      const y0 = vertices[i0 * 5 + 1]!;
      const z0 = vertices[i0 * 5 + 2]!;

      const x1 = vertices[i1 * 5]!;
      const y1 = vertices[i1 * 5 + 1]!;
      const z1 = vertices[i1 * 5 + 2]!;

      const x2 = vertices[i2 * 5]!;
      const y2 = vertices[i2 * 5 + 1]!;
      const z2 = vertices[i2 * 5 + 2]!;

      // Check if point is inside this triangle using barycentric coordinates
      const bary = this.barycentric(worldX, worldY, x0, y0, x1, y1, x2, y2);

      if (bary && bary.u >= 0 && bary.v >= 0 && bary.u + bary.v <= 1) {
        // Interpolate height using barycentric coordinates
        const w = 1 - bary.u - bary.v;
        return w * z0 + bary.u * z1 + bary.v * z2;
      }
    }

    // Point not found in any triangle (shouldn't happen within bounds)
    // Fall back to nearest vertex
    return this.nearestVertexHeight(meshData, worldX, worldY);
  }

  /**
   * Compute barycentric coordinates for point (px, py) in triangle (ax, ay), (bx, by), (cx, cy).
   * Returns { u, v } where the point is at (1-u-v)*A + u*B + v*C
   */
  private barycentric(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ): { u: number; v: number } | null {
    const v0x = cx - ax;
    const v0y = cy - ay;
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = px - ax;
    const v2y = py - ay;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const denom = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(denom) < 1e-10) {
      return null; // Degenerate triangle
    }

    const invDenom = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return { u: v, v: u }; // Swapped to match our convention
  }

  /**
   * Find height of nearest vertex (fallback).
   */
  private nearestVertexHeight(
    meshData: TerrainMeshData,
    worldX: number,
    worldY: number
  ): number {
    const { vertices } = meshData;
    const vertexCount = vertices.length / 5;

    let nearestDist = Infinity;
    let nearestHeight = 0;

    for (let i = 0; i < vertexCount; i++) {
      const vx = vertices[i * 5]!;
      const vy = vertices[i * 5 + 1]!;
      const vz = vertices[i * 5 + 2]!;

      const dx = worldX - vx;
      const dy = worldY - vy;
      const dist = dx * dx + dy * dy;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestHeight = vz;
      }
    }

    return nearestHeight;
  }

  /**
   * Drape a 3D position onto the terrain.
   * Returns a new position with Z set to terrain height plus optional offset.
   */
  drapePosition(x: number, y: number, offset: number = 0): Vec3 {
    const height = this.getHeightAt(x, y);
    return [x, y, height + offset];
  }

  /**
   * Drape an array of 2D positions onto the terrain.
   */
  drapePositions(
    positions: Array<{ x: number; y: number }>,
    offset: number = 0
  ): Vec3[] {
    return positions.map((p) => this.drapePosition(p.x, p.y, offset));
  }
}
