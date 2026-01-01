/**
 * Tile Clipping Tests
 */

import { describe, it, expect } from "vitest";
import {
  clipPolygonToTile,
  clipLineToTile,
  findPolygonTiles,
  findLineTiles,
} from "./clipToTile";

describe("clipPolygonToTile", () => {
  it("returns null for polygon fully outside tile", () => {
    const ring: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
      [0.1, 0.2],
    ];
    // Tile at z=1, x=1, y=1 covers [0.5, 0.5] to [1, 1]
    const result = clipPolygonToTile(ring, { z: 1, x: 1, y: 1 });
    expect(result).toBeNull();
  });

  it("returns full polygon in tile-relative coords when fully inside", () => {
    // Polygon in the first quadrant of tile (0, 0) at zoom 1
    const ring: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
      [0.1, 0.2],
    ];
    // Tile at z=1, x=0, y=0 covers [0, 0] to [0.5, 0.5]
    const result = clipPolygonToTile(ring, { z: 1, x: 0, y: 0 });

    expect(result).not.toBeNull();
    expect(result!.length).toBe(4);

    // Verify conversion to tile-relative (0-1) coords
    // World [0.1, 0.1] in tile [0,0] at zoom 1 should become [0.2, 0.2]
    // because tile covers [0, 0.5] in world, so 0.1 is at 0.1/0.5 = 0.2 in tile
    expect(result![0]![0]).toBeCloseTo(0.2, 5);
    expect(result![0]![1]).toBeCloseTo(0.2, 5);
  });

  it("clips polygon crossing tile boundary", () => {
    // Polygon spanning tile boundary
    const ring: [number, number][] = [
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
      [0.4, 0.6],
    ];

    // Clip to tile z=1, x=0, y=0 (covers [0, 0.5])
    const result = clipPolygonToTile(ring, { z: 1, x: 0, y: 0 });

    expect(result).not.toBeNull();
    // Should be clipped to [0.4, 0.5] range in world,
    // which is [0.8, 1.0] in tile-relative coords
    for (const coord of result!) {
      expect(coord[0]).toBeGreaterThanOrEqual(0);
      expect(coord[0]).toBeLessThanOrEqual(1);
      expect(coord[1]).toBeGreaterThanOrEqual(0);
      expect(coord[1]).toBeLessThanOrEqual(1);
    }
  });

  it("handles polygon with less than 3 points", () => {
    const result = clipPolygonToTile(
      [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      { z: 0, x: 0, y: 0 }
    );
    expect(result).toBeNull();
  });
});

describe("clipLineToTile", () => {
  it("returns empty array for line fully outside tile", () => {
    const coords: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.2],
    ];
    // Tile at z=1, x=1, y=1 covers [0.5, 1]
    const result = clipLineToTile(coords, { z: 1, x: 1, y: 1 });
    expect(result.length).toBe(0);
  });

  it("returns full line in tile-relative coords when fully inside", () => {
    const coords: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.2],
      [0.3, 0.1],
    ];
    // Tile at z=1, x=0, y=0 covers [0, 0.5]
    const result = clipLineToTile(coords, { z: 1, x: 0, y: 0 });

    expect(result.length).toBe(1); // One continuous segment
    expect(result[0]!.length).toBe(3); // All 3 points

    // Verify tile-relative conversion
    expect(result[0]![0]![0]).toBeCloseTo(0.2, 5); // 0.1 / 0.5 = 0.2
    expect(result[0]![0]![1]).toBeCloseTo(0.2, 5);
  });

  it("clips line crossing tile boundary into segments", () => {
    // Line that enters and exits the tile
    const coords: [number, number][] = [
      [0.3, 0.3], // inside tile z=1, x=0, y=0
      [0.6, 0.3], // outside (crosses right boundary at 0.5)
    ];

    const result = clipLineToTile(coords, { z: 1, x: 0, y: 0 });

    expect(result.length).toBe(1);
    const segment = result[0]!;
    expect(segment.length).toBe(2);

    // First point should be inside
    expect(segment[0]![0]).toBeCloseTo(0.6, 5); // 0.3 / 0.5 = 0.6
    // Second point should be at the boundary (1.0 in tile-relative)
    expect(segment[1]![0]).toBeCloseTo(1.0, 5);
  });

  it("returns multiple segments for line that crosses in and out", () => {
    // Line that goes: inside -> outside -> inside
    const coords: [number, number][] = [
      [0.1, 0.25],
      [0.6, 0.25], // exits right
      [0.6, 0.75], // outside
      [0.1, 0.75], // outside (below tile)
    ];

    const result = clipLineToTile(coords, { z: 1, x: 0, y: 0 });

    // Should have one segment (first part before exit)
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles single point line", () => {
    const result = clipLineToTile([[0.1, 0.1]], { z: 0, x: 0, y: 0 });
    expect(result.length).toBe(0);
  });
});

describe("findPolygonTiles", () => {
  it("returns single tile for small polygon", () => {
    const ring: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
      [0.1, 0.2],
    ];
    const tiles = findPolygonTiles(ring, 1);

    expect(tiles.length).toBe(1);
    expect(tiles[0]).toEqual({ z: 1, x: 0, y: 0 });
  });

  it("returns multiple tiles for polygon spanning tile boundaries", () => {
    const ring: [number, number][] = [
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
      [0.4, 0.6],
    ];
    const tiles = findPolygonTiles(ring, 1);

    // Should span all 4 tiles at zoom 1
    expect(tiles.length).toBe(4);
  });

  it("returns empty for empty polygon", () => {
    const tiles = findPolygonTiles([], 1);
    expect(tiles.length).toBe(0);
  });
});

describe("findLineTiles", () => {
  it("returns tiles touched by line", () => {
    const coords: [number, number][] = [
      [0.1, 0.1],
      [0.9, 0.1],
    ];
    const tiles = findLineTiles(coords, 1);

    // Line from left tile to right tile
    expect(tiles.length).toBe(2);
  });

  it("returns single tile for line within one tile", () => {
    const coords: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.2],
    ];
    const tiles = findLineTiles(coords, 1);

    expect(tiles.length).toBe(1);
    expect(tiles[0]).toEqual({ z: 1, x: 0, y: 0 });
  });

  it("returns empty for empty line", () => {
    const tiles = findLineTiles([], 1);
    expect(tiles.length).toBe(0);
  });
});
