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
      cam.zoom = Camera.MIN_ZOOM;
      cam.zoomAt(-5, 400, 300, 800, 600);
      expect(cam.zoom).toBe(Camera.MIN_ZOOM);

      cam.zoom = Camera.MAX_ZOOM;
      cam.zoomAt(5, 400, 300, 800, 600);
      expect(cam.zoom).toBe(Camera.MAX_ZOOM);
    });
  });
});
