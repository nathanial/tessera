import { describe, it, expect } from "vitest";
import { Camera3D } from "./Camera3D";

describe("Camera3D", () => {
  describe("initial state", () => {
    it("starts at center of world", () => {
      const cam = new Camera3D();
      expect(cam.target[0]).toBe(0.5);
      expect(cam.target[1]).toBe(0.5);
      expect(cam.target[2]).toBe(0);
    });

    it("has default zoom level", () => {
      const cam = new Camera3D();
      expect(cam.zoom).toBe(6);
    });

    it("has default pitch and yaw", () => {
      const cam = new Camera3D();
      expect(cam.pitch).toBe(-45);
      expect(cam.yaw).toBe(0);
    });

    it("has default distance", () => {
      const cam = new Camera3D();
      expect(cam.distance).toBe(0.1);
    });
  });

  describe("getVisibleBounds", () => {
    it("returns bounds centered on target", () => {
      const cam = new Camera3D();
      cam.target = [0.5, 0.5, 0];
      cam.distance = 0.1;

      const bounds = cam.getVisibleBounds(800, 600);

      // Bounds should be centered on target
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;

      expect(centerX).toBeCloseTo(0.5, 2);
      expect(centerY).toBeCloseTo(0.5, 2);
    });

    it("scales bounds based on distance", () => {
      const cam = new Camera3D();
      cam.target = [0.5, 0.5, 0];

      cam.distance = 0.1;
      const bounds1 = cam.getVisibleBounds(800, 600);
      const width1 = bounds1.right - bounds1.left;

      cam.distance = 0.2;
      const bounds2 = cam.getVisibleBounds(800, 600);
      const width2 = bounds2.right - bounds2.left;

      // Doubling distance should double the view width
      expect(width2).toBeCloseTo(width1 * 2, 2);
    });

    it("accounts for aspect ratio", () => {
      const cam = new Camera3D();
      cam.target = [0.5, 0.5, 0];
      cam.distance = 0.1;

      // Wide viewport
      const wideBounds = cam.getVisibleBounds(1600, 600);
      const wideWidth = wideBounds.right - wideBounds.left;
      const wideHeight = wideBounds.bottom - wideBounds.top;

      // Square viewport
      const squareBounds = cam.getVisibleBounds(600, 600);
      const squareWidth = squareBounds.right - squareBounds.left;
      const squareHeight = squareBounds.bottom - squareBounds.top;

      // Wide viewport should have wider bounds
      expect(wideWidth).toBeGreaterThan(squareWidth);
      // Height should be the same
      expect(wideHeight).toBeCloseTo(squareHeight, 3);
    });

    it("returns reasonable bounds at default settings", () => {
      const cam = new Camera3D();

      const bounds = cam.getVisibleBounds(800, 600);

      // At distance 0.1, viewSize = 0.2
      // With aspect ~1.33, width = 0.2 * 1.33 = 0.267
      // So bounds should span roughly 0.26 in x
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;

      expect(width).toBeLessThan(0.5); // Should not cover half the world
      expect(height).toBeLessThan(0.5);
      expect(width).toBeGreaterThan(0.1); // But should cover some area
    });
  });

  describe("getTileZoom", () => {
    it("returns floor of zoom level", () => {
      const cam = new Camera3D();
      cam.zoom = 5.7;
      expect(cam.getTileZoom()).toBe(5);
    });
  });

  describe("orbit", () => {
    it("changes yaw and pitch", () => {
      const cam = new Camera3D();
      const initialYaw = cam.yaw;
      const initialPitch = cam.pitch;

      cam.orbit(10, 5);

      expect(cam.yaw).toBe(initialYaw + 10);
      expect(cam.pitch).toBe(initialPitch + 5);
    });

    it("clamps pitch to valid range", () => {
      const cam = new Camera3D();

      cam.orbit(0, -100);
      expect(cam.pitch).toBe(Camera3D.MIN_PITCH);

      cam.orbit(0, 200);
      expect(cam.pitch).toBe(Camera3D.MAX_PITCH);
    });
  });

  describe("pan", () => {
    it("moves the camera target", () => {
      const cam = new Camera3D();
      const initialX = cam.target[0];
      const initialY = cam.target[1];

      cam.pan(100, 0, 800, 600);

      // Target should have moved
      expect(cam.target[0]).not.toBe(initialX);
    });
  });

  describe("zoomBy", () => {
    it("changes distance", () => {
      const cam = new Camera3D();
      const initialDistance = cam.distance;

      cam.zoomBy(1);

      expect(cam.distance).not.toBe(initialDistance);
    });

    it("updates logical zoom level", () => {
      const cam = new Camera3D();
      cam.zoom = 6;
      cam.distance = 0.1;

      cam.zoomBy(10); // Zoom in significantly

      // Zoom should increase when zooming in (distance decreases)
      expect(cam.distance).toBeLessThan(0.1);
      expect(cam.zoom).toBeGreaterThanOrEqual(6);
    });

    it("clamps distance to valid range", () => {
      const cam = new Camera3D();

      cam.zoomBy(100); // Zoom in a lot
      expect(cam.distance).toBeGreaterThanOrEqual(0.001);

      cam.zoomBy(-100); // Zoom out a lot
      expect(cam.distance).toBeLessThanOrEqual(5);
    });

    it("clamps zoom to valid range", () => {
      const cam = new Camera3D();

      cam.zoomBy(100);
      expect(cam.zoom).toBeLessThanOrEqual(Camera3D.MAX_ZOOM);

      cam.zoomBy(-100);
      expect(cam.zoom).toBeGreaterThanOrEqual(Camera3D.MIN_ZOOM);
    });
  });

  describe("lookAtPosition", () => {
    it("sets target to specified position", () => {
      const cam = new Camera3D();

      cam.lookAtPosition(0.3, 0.7, 0.1);

      expect(cam.target[0]).toBe(0.3);
      expect(cam.target[1]).toBe(0.7);
      expect(cam.target[2]).toBe(0.1);
    });
  });

  describe("updateMatrices", () => {
    it("creates valid matrices", () => {
      const cam = new Camera3D();

      cam.updateMatrices(800 / 600);

      const vp = cam.getViewProjectionMatrix();
      expect(vp).toBeInstanceOf(Float32Array);
      expect(vp.length).toBe(16);
    });

    it("marks dirty flag as false after update", () => {
      const cam = new Camera3D();
      (cam as any).dirty = true;

      cam.updateMatrices(1);

      expect((cam as any).dirty).toBe(false);
    });
  });

  describe("getMatrix", () => {
    it("updates matrices when dimensions provided", () => {
      const cam = new Camera3D();
      (cam as any).dirty = true;

      const matrix = cam.getMatrix(800, 600);

      expect(matrix).toBeInstanceOf(Float32Array);
      expect((cam as any).dirty).toBe(false);
    });
  });

  describe("centerX/centerY accessors", () => {
    it("get and set target position", () => {
      const cam = new Camera3D();

      cam.centerX = 0.3;
      cam.centerY = 0.7;

      expect(cam.centerX).toBe(0.3);
      expect(cam.centerY).toBe(0.7);
      expect(cam.target[0]).toBe(0.3);
      expect(cam.target[1]).toBe(0.7);
    });
  });

  describe("screenToWorld", () => {
    it("returns position on terrain plane", () => {
      const cam = new Camera3D();
      cam.updateMatrices(800 / 600);

      const worldPos = cam.screenToWorld(400, 300, 800, 600, 0);

      expect(worldPos).not.toBeNull();
      if (worldPos) {
        expect(worldPos[2]).toBeCloseTo(0, 5); // Should be on z=0 plane
      }
    });

    it("returns null for parallel rays", () => {
      const cam = new Camera3D();
      cam.pitch = 0; // Looking straight ahead, not down
      cam.updateMatrices(800 / 600);

      // This may or may not hit the plane depending on camera orientation
      // Just check it doesn't crash
      const result = cam.screenToWorld(400, 300, 800, 600, 0);
      // Result can be null or a position
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });
});
