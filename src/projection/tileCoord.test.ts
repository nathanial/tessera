/**
 * Tile Coordinate Tests
 */

import { describe, it, expect } from "vitest";
import {
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

describe("worldToTile", () => {
  it("returns tile (0, 0) at zoom 0 for any world coord", () => {
    const result = worldToTile({ x: 0.5, y: 0.5 }, 0);
    expect(result).toEqual({ z: 0, x: 0, y: 0 });
  });

  it("returns correct tile at zoom 1", () => {
    expect(worldToTile({ x: 0.25, y: 0.25 }, 1)).toEqual({ z: 1, x: 0, y: 0 });
    expect(worldToTile({ x: 0.75, y: 0.25 }, 1)).toEqual({ z: 1, x: 1, y: 0 });
    expect(worldToTile({ x: 0.25, y: 0.75 }, 1)).toEqual({ z: 1, x: 0, y: 1 });
    expect(worldToTile({ x: 0.75, y: 0.75 }, 1)).toEqual({ z: 1, x: 1, y: 1 });
  });

  it("handles tile boundaries correctly (point on boundary goes to next tile)", () => {
    const result = worldToTile({ x: 0.5, y: 0.5 }, 1);
    expect(result).toEqual({ z: 1, x: 1, y: 1 });
  });

  it("clamps coordinates to valid tile range", () => {
    expect(worldToTile({ x: -0.1, y: 0.5 }, 2)).toEqual({ z: 2, x: 0, y: 2 });
    expect(worldToTile({ x: 1.1, y: 0.5 }, 2)).toEqual({ z: 2, x: 3, y: 2 });
  });
});

describe("worldToTileRelative", () => {
  it("returns localX, localY in [0, 1) range", () => {
    const result = worldToTileRelative({ x: 0.3, y: 0.7 }, 2);
    expect(result.localX).toBeGreaterThanOrEqual(0);
    expect(result.localX).toBeLessThan(1);
    expect(result.localY).toBeGreaterThanOrEqual(0);
    expect(result.localY).toBeLessThan(1);
  });

  it("preserves precision at zoom 19", () => {
    const world = { x: 0.123456789, y: 0.987654321 };
    const tileRel = worldToTileRelative(world, 19);
    const recovered = tileRelativeToWorld(tileRel);

    // Should recover original with at least 9 decimal places
    expect(recovered.x).toBeCloseTo(world.x, 9);
    expect(recovered.y).toBeCloseTo(world.y, 9);
  });

  it("handles edge case at tile origin", () => {
    const result = worldToTileRelative({ x: 0.5, y: 0.5 }, 1);
    expect(result.tile).toEqual({ z: 1, x: 1, y: 1 });
    expect(result.localX).toBeCloseTo(0, 10);
    expect(result.localY).toBeCloseTo(0, 10);
  });
});

describe("tileRelativeToWorld", () => {
  it("is inverse of worldToTileRelative", () => {
    const testCases = [
      { x: 0.0, y: 0.0 },
      { x: 0.5, y: 0.5 },
      { x: 0.999, y: 0.001 },
      { x: 0.123456789, y: 0.987654321 },
    ];

    for (const world of testCases) {
      for (const zoom of [0, 5, 10, 15, 19]) {
        const tileRel = worldToTileRelative(world, zoom);
        const recovered = tileRelativeToWorld(tileRel);
        expect(recovered.x).toBeCloseTo(world.x, 9);
        expect(recovered.y).toBeCloseTo(world.y, 9);
      }
    }
  });
});

describe("lngLatToTileRelative", () => {
  it("converts San Francisco to tile-relative coords", () => {
    const result = lngLatToTileRelative(-122.4194, 37.7749, 12);
    expect(result.tile.z).toBe(12);
    expect(result.tile.x).toBeGreaterThan(0);
    expect(result.tile.y).toBeGreaterThan(0);
    expect(result.localX).toBeGreaterThanOrEqual(0);
    expect(result.localX).toBeLessThan(1);
  });
});

describe("getTileBounds", () => {
  it("returns correct bounds at zoom 0", () => {
    const bounds = getTileBounds({ z: 0, x: 0, y: 0 });
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(1);
    expect(bounds.maxY).toBe(1);
  });

  it("returns correct bounds at zoom 1", () => {
    const bounds = getTileBounds({ z: 1, x: 0, y: 0 });
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(0.5);
    expect(bounds.maxY).toBe(0.5);
  });

  it("returns non-overlapping bounds for adjacent tiles", () => {
    const bounds1 = getTileBounds({ z: 2, x: 1, y: 1 });
    const bounds2 = getTileBounds({ z: 2, x: 2, y: 1 });
    expect(bounds1.maxX).toBe(bounds2.minX);
  });
});

describe("getTileSize", () => {
  it("returns 1 at zoom 0", () => {
    expect(getTileSize(0)).toBe(1);
  });

  it("returns 0.5 at zoom 1", () => {
    expect(getTileSize(1)).toBe(0.5);
  });

  it("returns 1/2^zoom", () => {
    expect(getTileSize(4)).toBe(1 / 16);
    expect(getTileSize(10)).toBe(1 / 1024);
  });
});

describe("tilesEqual", () => {
  it("returns true for equal tiles", () => {
    expect(tilesEqual({ z: 5, x: 10, y: 15 }, { z: 5, x: 10, y: 15 })).toBe(
      true
    );
  });

  it("returns false for different tiles", () => {
    expect(tilesEqual({ z: 5, x: 10, y: 15 }, { z: 5, x: 10, y: 16 })).toBe(
      false
    );
    expect(tilesEqual({ z: 5, x: 10, y: 15 }, { z: 6, x: 10, y: 15 })).toBe(
      false
    );
  });
});

describe("tileToString / stringToTile", () => {
  it("converts tile to string and back", () => {
    const tile = { z: 12, x: 654, y: 1234 };
    const str = tileToString(tile);
    expect(str).toBe("12/654/1234");
    expect(stringToTile(str)).toEqual(tile);
  });
});

describe("getTilesInBounds", () => {
  it("returns single tile when bounds fit in one tile", () => {
    const tiles = getTilesInBounds(
      { minX: 0.1, minY: 0.1, maxX: 0.2, maxY: 0.2 },
      2
    );
    expect(tiles.length).toBe(1);
  });

  it("returns 4 tiles for center of world at zoom 1", () => {
    const tiles = getTilesInBounds(
      { minX: 0.25, minY: 0.25, maxX: 0.75, maxY: 0.75 },
      1
    );
    expect(tiles.length).toBe(4);
  });

  it("returns all tiles at zoom 0", () => {
    const tiles = getTilesInBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 0);
    expect(tiles.length).toBe(1);
    expect(tiles[0]).toEqual({ z: 0, x: 0, y: 0 });
  });
});

describe("getCoordsBounds", () => {
  it("returns correct bounds for array of coords", () => {
    const coords: [number, number][] = [
      [0.1, 0.2],
      [0.3, 0.1],
      [0.2, 0.4],
    ];
    const bounds = getCoordsBounds(coords);
    expect(bounds.minX).toBe(0.1);
    expect(bounds.maxX).toBe(0.3);
    expect(bounds.minY).toBe(0.1);
    expect(bounds.maxY).toBe(0.4);
  });

  it("returns zero bounds for empty array", () => {
    const bounds = getCoordsBounds([]);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(0);
  });

  it("handles single coordinate", () => {
    const bounds = getCoordsBounds([[0.5, 0.5]]);
    expect(bounds.minX).toBe(0.5);
    expect(bounds.maxX).toBe(0.5);
    expect(bounds.minY).toBe(0.5);
    expect(bounds.maxY).toBe(0.5);
  });
});
