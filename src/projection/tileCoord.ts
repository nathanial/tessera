/**
 * Tile Coordinate Utilities
 *
 * Functions for converting between world coordinates and tile-relative coordinates.
 * Tile-relative coordinates preserve precision at high zoom levels by storing
 * positions relative to a tile's origin rather than in global world space.
 */

import type {
  WorldCoord,
  TileKey,
  TileRelativeCoord,
  WorldBounds,
} from "./types";
import { lngLatToWorld } from "./mercator";

/**
 * Get the tile containing a world coordinate at a given zoom level.
 *
 * @param world - World coordinate (0-1 range)
 * @param zoom - Zoom level (0-19)
 * @returns Tile key with integer x, y coordinates
 */
export function worldToTile(world: WorldCoord, zoom: number): TileKey {
  const numTiles = 1 << zoom; // 2^zoom
  const x = Math.floor(world.x * numTiles);
  const y = Math.floor(world.y * numTiles);
  return {
    z: zoom,
    x: Math.max(0, Math.min(numTiles - 1, x)),
    y: Math.max(0, Math.min(numTiles - 1, y)),
  };
}

/**
 * Convert world coordinate to tile-relative coordinate.
 *
 * The returned localX and localY are in the range [0, 1) representing
 * the position within the tile. This preserves precision at high zoom
 * levels where global coordinates would lose significant digits.
 *
 * @param world - World coordinate (0-1 range)
 * @param zoom - Zoom level
 * @returns Tile-relative coordinate with localX/localY in 0-1 range
 */
export function worldToTileRelative(
  world: WorldCoord,
  zoom: number
): TileRelativeCoord {
  const numTiles = 1 << zoom;
  const tileX = Math.floor(world.x * numTiles);
  const tileY = Math.floor(world.y * numTiles);

  return {
    tile: {
      z: zoom,
      x: Math.max(0, Math.min(numTiles - 1, tileX)),
      y: Math.max(0, Math.min(numTiles - 1, tileY)),
    },
    localX: world.x * numTiles - tileX,
    localY: world.y * numTiles - tileY,
  };
}

/**
 * Convert tile-relative coordinate back to world coordinate.
 *
 * @param coord - Tile-relative coordinate
 * @returns World coordinate (0-1 range)
 */
export function tileRelativeToWorld(coord: TileRelativeCoord): WorldCoord {
  const numTiles = 1 << coord.tile.z;
  return {
    x: (coord.tile.x + coord.localX) / numTiles,
    y: (coord.tile.y + coord.localY) / numTiles,
  };
}

/**
 * Convert WGS84 directly to tile-relative coordinate.
 * Convenience function combining lngLatToWorld + worldToTileRelative.
 *
 * @param lng - Longitude in degrees
 * @param lat - Latitude in degrees
 * @param zoom - Zoom level
 * @returns Tile-relative coordinate
 */
export function lngLatToTileRelative(
  lng: number,
  lat: number,
  zoom: number
): TileRelativeCoord {
  const world = lngLatToWorld(lng, lat);
  return worldToTileRelative(world, zoom);
}

/**
 * Get tile bounds in world coordinates.
 *
 * @param tile - Tile key
 * @returns Bounding box in world coordinates
 */
export function getTileBounds(tile: TileKey): WorldBounds {
  const numTiles = 1 << tile.z;
  const size = 1 / numTiles;
  return {
    minX: tile.x * size,
    minY: tile.y * size,
    maxX: (tile.x + 1) * size,
    maxY: (tile.y + 1) * size,
  };
}

/**
 * Get tile size in world coordinates at a given zoom level.
 *
 * @param zoom - Zoom level
 * @returns Size of a tile in world coordinates
 */
export function getTileSize(zoom: number): number {
  return 1 / (1 << zoom);
}

/**
 * Check if two tile keys are equal.
 *
 * @param a - First tile key
 * @param b - Second tile key
 * @returns True if tiles are equal
 */
export function tilesEqual(a: TileKey, b: TileKey): boolean {
  return a.z === b.z && a.x === b.x && a.y === b.y;
}

/**
 * Get a string key for a tile, useful for Map/Set operations.
 *
 * @param tile - Tile key
 * @returns String representation "z/x/y"
 */
export function tileToString(tile: TileKey): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Parse a tile string key back to a TileKey.
 *
 * @param str - String in format "z/x/y"
 * @returns Tile key
 */
export function stringToTile(str: string): TileKey {
  const [z, x, y] = str.split("/").map(Number);
  return { z: z!, x: x!, y: y! };
}

/**
 * Find all tiles that a world bounding box touches at a given zoom level.
 *
 * @param bounds - World coordinate bounds
 * @param zoom - Zoom level
 * @returns Array of tile keys
 */
export function getTilesInBounds(bounds: WorldBounds, zoom: number): TileKey[] {
  const numTiles = 1 << zoom;

  const minTileX = Math.max(0, Math.floor(bounds.minX * numTiles));
  const maxTileX = Math.min(numTiles - 1, Math.floor(bounds.maxX * numTiles));
  const minTileY = Math.max(0, Math.floor(bounds.minY * numTiles));
  const maxTileY = Math.min(numTiles - 1, Math.floor(bounds.maxY * numTiles));

  const tiles: TileKey[] = [];
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/**
 * Calculate the world bounds of an array of coordinates.
 *
 * @param coords - Array of [x, y] world coordinates
 * @returns World bounds
 */
export function getCoordsBounds(coords: [number, number][]): WorldBounds {
  if (coords.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = coords[0]![0];
  let maxX = coords[0]![0];
  let minY = coords[0]![1];
  let maxY = coords[0]![1];

  for (let i = 1; i < coords.length; i++) {
    const [x, y] = coords[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}
