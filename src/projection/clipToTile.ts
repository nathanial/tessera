/**
 * Tile Clipping Algorithms
 *
 * Functions for clipping polygons and lines to tile boundaries.
 * Uses Sutherland-Hodgman for polygons and Cohen-Sutherland for lines.
 */

import type { TileKey, WorldBounds } from "./types";
import { getTileBounds } from "./tileCoord";

/** 2D coordinate as [x, y] tuple */
export type Coord = [number, number];

/**
 * Sutherland-Hodgman polygon clipping to tile bounds.
 *
 * @param ring - Polygon ring as array of [x, y] world coordinates
 * @param tile - Tile to clip to
 * @returns Clipped coordinates in tile-relative space (0-1), or null if fully outside
 */
export function clipPolygonToTile(ring: Coord[], tile: TileKey): Coord[] | null {
  if (ring.length < 3) return null;

  const bounds = getTileBounds(tile);
  let output = ring;

  // Clip against each edge: left, right, top, bottom
  output = clipAgainstEdge(output, bounds.minX, "left");
  if (output.length === 0) return null;

  output = clipAgainstEdge(output, bounds.maxX, "right");
  if (output.length === 0) return null;

  output = clipAgainstEdge(output, bounds.minY, "top");
  if (output.length === 0) return null;

  output = clipAgainstEdge(output, bounds.maxY, "bottom");
  if (output.length === 0) return null;

  // Convert to tile-relative coordinates (0-1 within tile)
  const numTiles = 1 << tile.z;
  return output.map(([x, y]) => [
    (x - bounds.minX) * numTiles,
    (y - bounds.minY) * numTiles,
  ]);
}

/**
 * Clip a polygon ring against a single edge.
 * Sutherland-Hodgman algorithm.
 */
function clipAgainstEdge(
  polygon: Coord[],
  edgeValue: number,
  edgeType: "left" | "right" | "top" | "bottom"
): Coord[] {
  if (polygon.length === 0) return [];

  const output: Coord[] = [];

  const isInside = (p: Coord): boolean => {
    switch (edgeType) {
      case "left":
        return p[0] >= edgeValue;
      case "right":
        return p[0] <= edgeValue;
      case "top":
        return p[1] >= edgeValue;
      case "bottom":
        return p[1] <= edgeValue;
    }
  };

  const intersect = (p1: Coord, p2: Coord): Coord => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];

    let t: number;
    if (edgeType === "left" || edgeType === "right") {
      t = (edgeValue - p1[0]) / dx;
    } else {
      t = (edgeValue - p1[1]) / dy;
    }

    return [p1[0] + t * dx, p1[1] + t * dy];
  };

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;

    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside) {
      output.push(current);
      if (!nextInside) {
        output.push(intersect(current, next));
      }
    } else if (nextInside) {
      output.push(intersect(current, next));
    }
  }

  return output;
}

/**
 * Cohen-Sutherland line clipping to tile bounds.
 * Clips a polyline to tile boundaries and returns segments in tile-relative space.
 *
 * @param coords - Polyline as array of [x, y] world coordinates
 * @param tile - Tile to clip to
 * @returns Array of clipped segments, each in tile-relative coordinates (0-1)
 */
export function clipLineToTile(coords: Coord[], tile: TileKey): Coord[][] {
  if (coords.length < 2) return [];

  const bounds = getTileBounds(tile);
  const numTiles = 1 << tile.z;
  const segments: Coord[][] = [];

  let currentSegment: Coord[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const clipped = clipSegment(coords[i]!, coords[i + 1]!, bounds);

    if (clipped) {
      const [p1, p2] = clipped;

      // Convert to tile-relative coordinates
      const local1: Coord = [
        (p1[0] - bounds.minX) * numTiles,
        (p1[1] - bounds.minY) * numTiles,
      ];
      const local2: Coord = [
        (p2[0] - bounds.minX) * numTiles,
        (p2[1] - bounds.minY) * numTiles,
      ];

      // Check if this connects to the previous segment
      if (currentSegment.length === 0) {
        currentSegment.push(local1);
      } else {
        // If the start of this segment doesn't match the end of current,
        // finish current and start new
        const lastPoint = currentSegment[currentSegment.length - 1]!;
        if (!coordsEqual(local1, lastPoint)) {
          segments.push(currentSegment);
          currentSegment = [local1];
        }
      }

      currentSegment.push(local2);

      // If the segment was clipped at the exit point, finish this segment
      if (!coordsEqual(p2, coords[i + 1]!)) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    } else {
      // Segment fully outside - finish current segment
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment);
  }

  return segments;
}

/** Outcode bits for Cohen-Sutherland */
const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

/**
 * Compute outcode for a point relative to bounds.
 */
function computeOutcode(x: number, y: number, bounds: WorldBounds): number {
  let code = INSIDE;
  if (x < bounds.minX) code |= LEFT;
  else if (x > bounds.maxX) code |= RIGHT;
  if (y < bounds.minY) code |= TOP;
  else if (y > bounds.maxY) code |= BOTTOM;
  return code;
}

/**
 * Cohen-Sutherland line segment clipping.
 *
 * @param p1 - Start point
 * @param p2 - End point
 * @param bounds - Clipping bounds
 * @returns Clipped segment [start, end] or null if fully outside
 */
function clipSegment(
  p1: Coord,
  p2: Coord,
  bounds: WorldBounds
): [Coord, Coord] | null {
  let [x1, y1] = p1;
  let [x2, y2] = p2;

  let outcode1 = computeOutcode(x1, y1, bounds);
  let outcode2 = computeOutcode(x2, y2, bounds);

  while (true) {
    if ((outcode1 | outcode2) === 0) {
      // Both inside - accept
      return [
        [x1, y1],
        [x2, y2],
      ];
    }

    if ((outcode1 & outcode2) !== 0) {
      // Both on same side outside - reject
      return null;
    }

    // Pick point outside the bounds
    const outcodeOut = outcode1 !== 0 ? outcode1 : outcode2;
    let x: number, y: number;

    // Find intersection with clip edge
    if (outcodeOut & TOP) {
      x = x1 + ((x2 - x1) * (bounds.minY - y1)) / (y2 - y1);
      y = bounds.minY;
    } else if (outcodeOut & BOTTOM) {
      x = x1 + ((x2 - x1) * (bounds.maxY - y1)) / (y2 - y1);
      y = bounds.maxY;
    } else if (outcodeOut & RIGHT) {
      y = y1 + ((y2 - y1) * (bounds.maxX - x1)) / (x2 - x1);
      x = bounds.maxX;
    } else {
      // LEFT
      y = y1 + ((y2 - y1) * (bounds.minX - x1)) / (x2 - x1);
      x = bounds.minX;
    }

    // Update the point that was outside
    if (outcodeOut === outcode1) {
      x1 = x;
      y1 = y;
      outcode1 = computeOutcode(x1, y1, bounds);
    } else {
      x2 = x;
      y2 = y;
      outcode2 = computeOutcode(x2, y2, bounds);
    }
  }
}

/**
 * Check if two coordinates are approximately equal.
 */
function coordsEqual(a: Coord, b: Coord, epsilon = 1e-10): boolean {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

/**
 * Find all tiles that a polygon touches.
 *
 * @param ring - Polygon ring in world coordinates
 * @param zoom - Zoom level
 * @returns Array of tile keys
 */
export function findPolygonTiles(ring: Coord[], zoom: number): TileKey[] {
  if (ring.length === 0) return [];

  // Get bounding box
  let minX = ring[0]![0];
  let maxX = ring[0]![0];
  let minY = ring[0]![1];
  let maxY = ring[0]![1];

  for (let i = 1; i < ring.length; i++) {
    const [x, y] = ring[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const numTiles = 1 << zoom;
  const minTileX = Math.max(0, Math.floor(minX * numTiles));
  const maxTileX = Math.min(numTiles - 1, Math.floor(maxX * numTiles));
  const minTileY = Math.max(0, Math.floor(minY * numTiles));
  const maxTileY = Math.min(numTiles - 1, Math.floor(maxY * numTiles));

  const tiles: TileKey[] = [];
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/**
 * Find all tiles that a polyline touches.
 *
 * @param coords - Polyline in world coordinates
 * @param zoom - Zoom level
 * @returns Array of tile keys
 */
export function findLineTiles(coords: Coord[], zoom: number): TileKey[] {
  if (coords.length === 0) return [];

  // Get bounding box
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

  const numTiles = 1 << zoom;
  const minTileX = Math.max(0, Math.floor(minX * numTiles));
  const maxTileX = Math.min(numTiles - 1, Math.floor(maxX * numTiles));
  const minTileY = Math.max(0, Math.floor(minY * numTiles));
  const maxTileY = Math.min(numTiles - 1, Math.floor(maxY * numTiles));

  const tiles: TileKey[] = [];
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}
