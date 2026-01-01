/**
 * Projection Types
 *
 * Type definitions for coordinate systems used in Tessera.
 */

/** WGS84 longitude/latitude coordinates */
export interface LngLat {
  lng: number;
  lat: number;
}

/** Normalized Web Mercator world coordinate (0-1 range) */
export interface WorldCoord {
  x: number;
  y: number;
}

/** Tile coordinate with zoom level */
export interface TileKey {
  z: number;
  x: number;
  y: number;
}

/** Position relative to a tile's origin (0-1 range within tile) */
export interface TileRelativeCoord {
  tile: TileKey;
  /** X position within tile (0-1) */
  localX: number;
  /** Y position within tile (0-1) */
  localY: number;
}

/** Bounding box in world coordinates */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
