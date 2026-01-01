import { describe, it, expect } from "vitest";
import { Camera } from "./Camera";

describe("Camera", () => {
  describe("initial state", () => {
    it("starts at center of world", () => {
      const cam = new Camera();
      expect(cam.centerX).toBe(0.5);
      expect(cam.centerY).toBe(0.5);
      expect(cam.zoom).toBe(0);
    });
  });

  describe("getTileZoom", () => {
    it("returns floor of zoom level", () => {
      const cam = new Camera();
      cam.zoom = 5.7;
      expect(cam.getTileZoom()).toBe(5);
    });
  });

  describe("getMatrix", () => {
    it("returns a valid matrix", () => {
      const cam = new Camera();
      const m = cam.getMatrix(800, 600);
      expect(m).toBeInstanceOf(Float32Array);
      expect(m.length).toBe(9);
    });

    it("transforms world center to clip space origin", () => {
      const cam = new Camera();
      cam.centerX = 0.5;
      cam.centerY = 0.5;
      cam.zoom = 2; // At zoom 2, world is 2048px (512 * 4), viewport 512x512 shows 1/4 of world

      const m = cam.getMatrix(512, 512); // viewport matches tile size

      // Transform point (0.5, 0.5) - should map to (0, 0) in clip space
      const x = m[0]! * 0.5 + m[3]! * 0.5 + m[6]! * 1;
      const y = m[1]! * 0.5 + m[4]! * 0.5 + m[7]! * 1;

      expect(x).toBeCloseTo(0, 1);
      expect(y).toBeCloseTo(0, 1);
    });
  });

  describe("pan", () => {
    it("moves the camera center", () => {
      const cam = new Camera();
      const initialX = cam.centerX;
      const initialY = cam.centerY;

      cam.pan(100, 0, 800, 600);

      expect(cam.centerX).toBeLessThan(initialX); // panning right moves center left
      expect(cam.centerY).toBe(initialY);
    });
  });

  describe("zoomAt", () => {
    it("changes zoom level", () => {
      const cam = new Camera();
      cam.zoom = 5;
      cam.zoomAt(1, 400, 300, 800, 600);
      expect(cam.zoom).toBe(6);
    });

    it("clamps zoom to valid range", () => {
      const cam = new Camera();
      cam.zoom = 0;
      cam.zoomAt(-5, 400, 300, 800, 600);
      expect(cam.zoom).toBe(0);

      cam.zoom = 19;
      cam.zoomAt(5, 400, 300, 800, 600);
      expect(cam.zoom).toBe(19);
    });
  });

  describe("getTileRelativeMatrix", () => {
    it("returns a valid matrix", () => {
      const cam = new Camera();
      const m = cam.getTileRelativeMatrix({ z: 5, x: 10, y: 15 }, 800, 600);
      expect(m).toBeInstanceOf(Float32Array);
      expect(m.length).toBe(9);
    });

    it("transforms tile origin (0,0) to correct clip position", () => {
      const cam = new Camera();
      cam.centerX = 0.5;
      cam.centerY = 0.5;
      cam.zoom = 2;

      // Tile at z=2, x=2, y=2 has origin at (0.5, 0.5) in world space
      const m = cam.getTileRelativeMatrix({ z: 2, x: 2, y: 2 }, 512, 512);

      // Transform point (0, 0) in tile space - should map to (0, 0) in clip space
      // since tile origin matches camera center
      const x = m[0]! * 0 + m[3]! * 0 + m[6]! * 1;
      const y = m[1]! * 0 + m[4]! * 0 + m[7]! * 1;

      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(0, 5);
    });

    it("produces same result as getMatrix for equivalent world coords", () => {
      const cam = new Camera();
      cam.centerX = 0.3;
      cam.centerY = 0.6;
      cam.zoom = 4;

      const worldMatrix = cam.getMatrix(800, 600);

      // Test a few points - transform with world matrix vs tile-relative matrix
      const testTile = { z: 4, x: 5, y: 9 }; // arbitrary tile
      const tileMatrix = cam.getTileRelativeMatrix(testTile, 800, 600);

      // A point at (0.3, 0.7) in tile-local space
      const localX = 0.3;
      const localY = 0.7;

      // Calculate world coordinate equivalent
      const numTiles = 1 << testTile.z;
      const tileSize = 1 / numTiles;
      const worldX = testTile.x * tileSize + localX * tileSize;
      const worldY = testTile.y * tileSize + localY * tileSize;

      // Transform with world matrix
      const clipXWorld = worldMatrix[0]! * worldX + worldMatrix[3]! * worldY + worldMatrix[6]!;
      const clipYWorld = worldMatrix[1]! * worldX + worldMatrix[4]! * worldY + worldMatrix[7]!;

      // Transform with tile-relative matrix
      const clipXTile = tileMatrix[0]! * localX + tileMatrix[3]! * localY + tileMatrix[6]!;
      const clipYTile = tileMatrix[1]! * localX + tileMatrix[4]! * localY + tileMatrix[7]!;

      // Should produce same clip-space coordinates
      expect(clipXTile).toBeCloseTo(clipXWorld, 5);
      expect(clipYTile).toBeCloseTo(clipYWorld, 5);
    });

    it("works at high zoom levels (zoom 19)", () => {
      const cam = new Camera();
      cam.zoom = 19;
      cam.centerX = 0.123456789;
      cam.centerY = 0.987654321;

      // Should not throw or produce NaN
      const m = cam.getTileRelativeMatrix({ z: 19, x: 64678, y: 517058 }, 800, 600);

      expect(Number.isFinite(m[0])).toBe(true);
      expect(Number.isFinite(m[4])).toBe(true);
      expect(Number.isFinite(m[6])).toBe(true);
      expect(Number.isFinite(m[7])).toBe(true);
    });
  });
});
