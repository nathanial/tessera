/**
 * Projection Module
 *
 * Coordinate conversion utilities for Web Mercator projection
 * and tile-relative coordinate handling.
 */

export type {
  LngLat,
  WorldCoord,
  TileKey,
  TileRelativeCoord,
  WorldBounds,
} from "./types";

export {
  lngLatToWorld,
  worldToLngLat,
  lngLatToWorldArray,
  clampLatitude,
  MAX_LATITUDE,
} from "./mercator";

export {
  worldToTile,
  worldToTileRelative,
  tileRelativeToWorld,
  lngLatToTileRelative,
  getTileBounds,
  getTileSize,
  tilesEqual,
  tileToString,
  stringToTile,
  getTilesInBounds,
  getCoordsBounds,
} from "./tileCoord";

export {
  clipPolygonToTile,
  clipLineToTile,
  findPolygonTiles,
  findLineTiles,
} from "./clipToTile";
export type { Coord } from "./clipToTile";
