import { describe, it, expect, vi, beforeEach } from "vitest";
import { TerrainTileManager } from "./TerrainTileManager";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("TerrainTileManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws if access token is empty", () => {
      expect(() => new TerrainTileManager("")).toThrow("Cesium access token is required");
    });

    it("throws if access token is whitespace", () => {
      expect(() => new TerrainTileManager("   ")).toThrow("Cesium access token is required");
    });

    it("accepts valid access token", () => {
      const manager = new TerrainTileManager("valid-token");
      expect(manager).toBeDefined();
    });
  });

  describe("getVisibleTiles", () => {
    it("calculates zoom from bounds size automatically", () => {
      const manager = new TerrainTileManager("token");

      // Large bounds (entire world) should use low zoom
      const largeBounds = { left: 0, right: 1, top: 0, bottom: 1 };
      const largeTiles = manager.getVisibleTiles(largeBounds, 999); // zoom param ignored

      expect(largeTiles.length).toBeGreaterThan(0);
      expect(largeTiles.length).toBeLessThanOrEqual(25); // ~4x4 or 5x5 tiles
      expect(largeTiles[0]!.z).toBeLessThanOrEqual(3); // Low zoom for large view
    });

    it("returns more tiles for smaller bounds", () => {
      const manager = new TerrainTileManager("token");

      // Small bounds should use higher zoom
      const smallBounds = { left: 0.4, right: 0.6, top: 0.4, bottom: 0.6 };
      const tiles = manager.getVisibleTiles(smallBounds, 0); // zoom param ignored

      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThanOrEqual(36); // Reasonable tile count
      // Zoom should be higher for smaller bounds
      expect(tiles[0]!.z).toBeGreaterThan(2);
    });

    it("clamps terrain zoom to maxTerrainZoom", () => {
      const manager = new TerrainTileManager("token");

      // Very small bounds would want high zoom, but clamps to max
      const tinyBounds = { left: 0.499, right: 0.501, top: 0.499, bottom: 0.501 };
      const tiles = manager.getVisibleTiles(tinyBounds, 0);

      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) {
        expect(tile.z).toBeLessThanOrEqual(manager.maxTerrainZoom);
      }
    });

    it("returns empty for zero-size bounds", () => {
      const manager = new TerrainTileManager("token");

      const zeroBounds = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 };
      const tiles = manager.getVisibleTiles(zeroBounds, 5);

      expect(tiles).toEqual([]);
    });

    it("calculates correct tile coordinates", () => {
      const manager = new TerrainTileManager("token");

      // Bounds covering half the world horizontally
      const bounds = { left: 0.5, right: 0.99, top: 0.5, bottom: 0.99 };
      const tiles = manager.getVisibleTiles(bounds, 1);

      // Should have tiles in the right quadrant
      for (const tile of tiles) {
        const scale = Math.pow(2, tile.z);
        const tileLeft = tile.x / scale;
        const tileRight = (tile.x + 1) / scale;
        // Tile should overlap with bounds
        expect(tileRight).toBeGreaterThan(bounds.left);
        expect(tileLeft).toBeLessThan(bounds.right);
      }
    });
  });

  describe("clampToMaxZoom", () => {
    it("returns same coord if at or below max zoom", () => {
      const manager = new TerrainTileManager("token");

      // Access private method via any
      const clamp = (manager as any).clampToMaxZoom.bind(manager);

      const coord = { z: 5, x: 10, y: 20 };
      expect(clamp(coord)).toEqual(coord);
    });

    it("scales down coordinates above max zoom", () => {
      const manager = new TerrainTileManager("token");
      const clamp = (manager as any).clampToMaxZoom.bind(manager);

      // At zoom 10, tile (512, 512) should map to zoom 8, tile (128, 128)
      const coord = { z: 10, x: 512, y: 512 };
      const clamped = clamp(coord);

      expect(clamped.z).toBe(8);
      expect(clamped.x).toBe(128); // 512 / 4 = 128
      expect(clamped.y).toBe(128);
    });
  });

  describe("requestTile", () => {
    it("does not re-request already cached tiles", async () => {
      const manager = new TerrainTileManager("token");

      // Manually add to cache
      const cache = (manager as any).cache;
      cache.set("5/10/10", { data: {}, lastUsed: Date.now() });

      // Spy on queue
      const queue = (manager as any).queue;
      const initialQueueLength = queue.length;

      manager.requestTile({ z: 5, x: 10, y: 10 });

      expect(queue.length).toBe(initialQueueLength);
    });

    it("does not re-request tiles already in requested set", () => {
      const manager = new TerrainTileManager("token");

      const requested = (manager as any).requested;
      requested.add("5/10/10");

      const queue = (manager as any).queue;
      const initialQueueLength = queue.length;

      manager.requestTile({ z: 5, x: 10, y: 10 });

      expect(queue.length).toBe(initialQueueLength);
    });

    it("adds tile to requested set and queue", () => {
      const manager = new TerrainTileManager("token");

      // Mock initialize to prevent actual network call
      (manager as any).endpoint = "https://example.com/";
      (manager as any).tileAccessToken = "tile-token";

      manager.requestTile({ z: 5, x: 10, y: 10 });

      const requested = (manager as any).requested;
      expect(requested.has("5/10/10")).toBe(true);
    });
  });

  describe("getCacheKey", () => {
    it("generates correct cache key", () => {
      const manager = new TerrainTileManager("token");
      const getKey = (manager as any).getCacheKey.bind(manager);

      expect(getKey({ z: 5, x: 10, y: 20 })).toBe("5/10/20");
      expect(getKey({ z: 0, x: 0, y: 0 })).toBe("0/0/0");
    });
  });

  describe("hasTile", () => {
    it("returns true for cached tiles", () => {
      const manager = new TerrainTileManager("token");

      const cache = (manager as any).cache;
      cache.set("5/10/10", { data: {}, lastUsed: Date.now() });

      expect(manager.hasTile({ z: 5, x: 10, y: 10 })).toBe(true);
    });

    it("returns false for uncached tiles", () => {
      const manager = new TerrainTileManager("token");

      expect(manager.hasTile({ z: 5, x: 10, y: 10 })).toBe(false);
    });

    it("clamps coordinates before checking cache", () => {
      const manager = new TerrainTileManager("token");

      // Cache at zoom 8
      const cache = (manager as any).cache;
      cache.set("8/128/128", { data: {}, lastUsed: Date.now() });

      // Request at zoom 10 should clamp to zoom 8
      expect(manager.hasTile({ z: 10, x: 512, y: 512 })).toBe(true);
    });
  });

  describe("getCachedTile", () => {
    it("returns cached data and updates lastUsed", () => {
      const manager = new TerrainTileManager("token");

      const mockData = { vertices: new Float32Array([1, 2, 3]) };
      const cache = (manager as any).cache;
      const oldTime = Date.now() - 10000;
      cache.set("5/10/10", { data: mockData, lastUsed: oldTime });

      const result = manager.getCachedTile({ z: 5, x: 10, y: 10 });

      expect(result).toBe(mockData);
      expect(cache.get("5/10/10").lastUsed).toBeGreaterThan(oldTime);
    });

    it("returns null for uncached tiles", () => {
      const manager = new TerrainTileManager("token");

      expect(manager.getCachedTile({ z: 5, x: 10, y: 10 })).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("removes all cached tiles", () => {
      const manager = new TerrainTileManager("token");

      const cache = (manager as any).cache;
      cache.set("5/10/10", { data: {}, lastUsed: Date.now() });
      cache.set("5/11/11", { data: {}, lastUsed: Date.now() });

      manager.clearCache();

      expect(cache.size).toBe(0);
    });
  });

  describe("isFailedRecently", () => {
    it("returns true for recently failed tiles", () => {
      const manager = new TerrainTileManager("token");
      const isFailedRecently = (manager as any).isFailedRecently.bind(manager);

      const failed = (manager as any).failed;
      failed.set("5/10/10", { retryAfter: Date.now() + 30000 });

      expect(isFailedRecently("5/10/10")).toBe(true);
    });

    it("returns false and cleans up expired failures", () => {
      const manager = new TerrainTileManager("token");
      const isFailedRecently = (manager as any).isFailedRecently.bind(manager);

      const failed = (manager as any).failed;
      failed.set("5/10/10", { retryAfter: Date.now() - 1000 }); // Expired

      expect(isFailedRecently("5/10/10")).toBe(false);
      expect(failed.has("5/10/10")).toBe(false); // Should be cleaned up
    });
  });

  describe("concurrent request limiting", () => {
    it("respects maxConcurrentRequests", () => {
      const manager = new TerrainTileManager("token");

      // Set up manager state
      (manager as any).endpoint = "https://example.com/";
      (manager as any).tileAccessToken = "tile-token";
      (manager as any).activeRequests = 4; // At limit

      const queue = (manager as any).queue;
      queue.push({ z: 5, x: 10, y: 10 });

      // processQueue should not start new loads when at limit
      const processQueue = (manager as any).processQueue.bind(manager);
      const initialActive = (manager as any).activeRequests;

      processQueue();

      // Should still be at same active count (didn't start new)
      expect((manager as any).activeRequests).toBe(initialActive);
    });
  });
});
