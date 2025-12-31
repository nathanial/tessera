import { describe, it, expect } from "vitest";
import { TileManager } from "./TileManager";

// Mock WebGL2 context for testing
function createMockGL(): WebGL2RenderingContext {
  return {
    createTexture: () => ({}),
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: () => {},
    deleteTexture: () => {},
    TEXTURE_2D: 0x0DE1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
  } as unknown as WebGL2RenderingContext;
}

describe("TileManager", () => {
  describe("getVisibleTiles", () => {
    it("returns tiles for zoom 0 centered view", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      // At zoom 0, world is 256px, viewport 256x256 shows the whole world (1 tile)
      const tiles = tm.getVisibleTiles(0.5, 0.5, 0, 256, 256);

      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.some(t => t.z === 0 && t.x === 0 && t.y === 0)).toBe(true);
    });

    it("returns correct tile coordinates at zoom 1", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      // At zoom 1, world is 512px (2x2 tiles at 256px each)
      // With 256x256 viewport centered at (0.25, 0.25), we should see tile (0, 0)
      const tiles = tm.getVisibleTiles(0.25, 0.25, 1, 256, 256);

      expect(tiles.some(t => t.z === 1 && t.x === 0 && t.y === 0)).toBe(true);
    });

    it("returns multiple tiles for large viewport", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      // At zoom 2, world is 1024px (4x4 tiles)
      // With 1024x1024 viewport, we see the whole world = 16 tiles
      const tiles = tm.getVisibleTiles(0.5, 0.5, 2, 1024, 1024);

      expect(tiles.length).toBeGreaterThan(1);
    });

    it("wraps X coordinates correctly", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      // Position at x=0.9 at zoom 1 (2 tiles wide)
      // Should wrap tile coordinates properly
      const tiles = tm.getVisibleTiles(0.9, 0.5, 1, 800, 600);

      // All x coordinates should be 0 or 1 (valid for zoom 1)
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(2);
      }
    });

    it("clamps Y coordinates", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      // Position near edge
      const tiles = tm.getVisibleTiles(0.5, 0.05, 2, 800, 600);

      // Y should never be negative
      for (const t of tiles) {
        expect(t.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getTile", () => {
    it("returns null for uncached tile", () => {
      const gl = createMockGL();
      const tm = new TileManager(gl);

      const texture = tm.getTile(5, 10, 15);
      expect(texture).toBeNull(); // Not loaded yet
    });
  });
});
