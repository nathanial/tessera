import { describe, it, expect } from "vitest";
import {
  tileToMercatorBounds,
  quantizedHeightToWorld,
  HEIGHT_EXAGGERATION,
  HEIGHT_SCALE,
} from "./TerrainTileLoader";

describe("TerrainTileLoader", () => {
  describe("tileToMercatorBounds", () => {
    it("returns full world for zoom 0 tile", () => {
      const bounds = tileToMercatorBounds({ z: 0, x: 0, y: 0 });

      expect(bounds.west).toBeCloseTo(0, 5);
      expect(bounds.east).toBeCloseTo(1, 5);
      expect(bounds.south).toBeCloseTo(0, 5);
      expect(bounds.north).toBeCloseTo(1, 5);
    });

    it("returns quarter of world for zoom 1 tiles", () => {
      // Top-left tile at zoom 1
      const topLeft = tileToMercatorBounds({ z: 1, x: 0, y: 0 });
      expect(topLeft.west).toBeCloseTo(0, 5);
      expect(topLeft.east).toBeCloseTo(0.5, 5);
      expect(topLeft.north).toBeCloseTo(1, 5);
      expect(topLeft.south).toBeCloseTo(0.5, 5);

      // Bottom-right tile at zoom 1
      const bottomRight = tileToMercatorBounds({ z: 1, x: 1, y: 1 });
      expect(bottomRight.west).toBeCloseTo(0.5, 5);
      expect(bottomRight.east).toBeCloseTo(1, 5);
      expect(bottomRight.north).toBeCloseTo(0.5, 5);
      expect(bottomRight.south).toBeCloseTo(0, 5);
    });

    it("calculates correct bounds at higher zoom", () => {
      // At zoom 3, world is 8x8 tiles
      const bounds = tileToMercatorBounds({ z: 3, x: 4, y: 2 });

      // x=4 out of 8 means west at 0.5, east at 0.625
      expect(bounds.west).toBeCloseTo(0.5, 5);
      expect(bounds.east).toBeCloseTo(0.625, 5);

      // y=2 with TMS flipping: north = 1 - 2/8 = 0.75, south = 1 - 3/8 = 0.625
      expect(bounds.north).toBeCloseTo(0.75, 5);
      expect(bounds.south).toBeCloseTo(0.625, 5);
    });

    it("handles edge tiles correctly", () => {
      // Last tile in row/column at zoom 2
      const bounds = tileToMercatorBounds({ z: 2, x: 3, y: 3 });

      expect(bounds.east).toBeCloseTo(1, 5);
      expect(bounds.south).toBeCloseTo(0, 5);
    });
  });

  describe("quantizedHeightToWorld", () => {
    it("returns minimum height for quantized value 0", () => {
      const result = quantizedHeightToWorld(0, 100, 500);

      const expected = 100 * HEIGHT_SCALE * HEIGHT_EXAGGERATION;
      expect(result).toBeCloseTo(expected, 10);
    });

    it("returns maximum height for quantized value 32767", () => {
      const result = quantizedHeightToWorld(32767, 100, 500);

      const expected = 500 * HEIGHT_SCALE * HEIGHT_EXAGGERATION;
      expect(result).toBeCloseTo(expected, 10);
    });

    it("interpolates correctly for middle values", () => {
      // Half way between min and max
      const result = quantizedHeightToWorld(16383, 0, 1000);

      // Should be close to 500 meters (in world units)
      const expected = 500 * HEIGHT_SCALE * HEIGHT_EXAGGERATION;
      expect(result).toBeCloseTo(expected, 8);
    });

    it("handles negative heights", () => {
      const result = quantizedHeightToWorld(0, -100, 100);

      const expected = -100 * HEIGHT_SCALE * HEIGHT_EXAGGERATION;
      expect(result).toBeCloseTo(expected, 10);
    });

    it("applies height exaggeration", () => {
      const result = quantizedHeightToWorld(32767, 0, 1000);

      // Result should be 1000 * HEIGHT_SCALE * HEIGHT_EXAGGERATION
      // HEIGHT_EXAGGERATION = 10, so 10x the unexaggerated height
      const unexaggerated = 1000 * HEIGHT_SCALE;
      expect(result).toBeCloseTo(unexaggerated * HEIGHT_EXAGGERATION, 10);
    });
  });

  describe("constants", () => {
    it("has correct HEIGHT_EXAGGERATION", () => {
      expect(HEIGHT_EXAGGERATION).toBe(10);
    });

    it("has correct HEIGHT_SCALE", () => {
      // HEIGHT_SCALE = 1 / EARTH_CIRCUMFERENCE = 1 / 40075017
      expect(HEIGHT_SCALE).toBeCloseTo(1 / 40075017, 15);
    });
  });
});
