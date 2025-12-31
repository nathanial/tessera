import { describe, it, expect } from "vitest";
import { create, multiply, translate, scale, projection } from "./mat3";

describe("mat3", () => {
  describe("create", () => {
    it("creates an identity matrix", () => {
      const m = create();
      expect(m).toEqual(new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
      ]));
    });
  });

  describe("translate", () => {
    it("creates a translation matrix", () => {
      const m = translate(3, 4);
      expect(m[6]).toBe(3);
      expect(m[7]).toBe(4);
      expect(m[0]).toBe(1); // diagonal still 1
      expect(m[4]).toBe(1);
      expect(m[8]).toBe(1);
    });
  });

  describe("scale", () => {
    it("creates a scale matrix", () => {
      const m = scale(2, 3);
      expect(m[0]).toBe(2);
      expect(m[4]).toBe(3);
      expect(m[8]).toBe(1);
    });
  });

  describe("multiply", () => {
    it("multiplies identity by identity", () => {
      const a = create();
      const b = create();
      const c = multiply(a, b);
      expect(c).toEqual(create());
    });

    it("applies translation correctly", () => {
      const t = translate(5, 10);
      // Transform point (0, 0)
      // In homogeneous coords: [0, 0, 1]
      // Result should be [5, 10, 1]
      const x = t[0]! * 0 + t[3]! * 0 + t[6]! * 1;
      const y = t[1]! * 0 + t[4]! * 0 + t[7]! * 1;
      expect(x).toBe(5);
      expect(y).toBe(10);
    });

    it("combines translate then scale", () => {
      const t = translate(2, 3);
      const s = scale(10, 10);
      // Scale first, then translate: s * t means translate happens first in column-major
      const m = multiply(s, t);

      // Transform point (0, 0): should translate to (2,3), then scale to (20, 30)
      const x = m[0]! * 0 + m[3]! * 0 + m[6]! * 1;
      const y = m[1]! * 0 + m[4]! * 0 + m[7]! * 1;
      expect(x).toBe(20);
      expect(y).toBe(30);
    });
  });

  describe("projection", () => {
    it("creates an orthographic projection", () => {
      const p = projection(800, 600);
      // Should map (0,0) to (-1, 1) and (800,600) to (1, -1)

      // Test (0, 0) -> (-1, 1)
      const x0 = p[0]! * 0 + p[3]! * 0 + p[6]! * 1;
      const y0 = p[1]! * 0 + p[4]! * 0 + p[7]! * 1;
      expect(x0).toBeCloseTo(-1);
      expect(y0).toBeCloseTo(1);

      // Test (800, 600) -> (1, -1)
      const x1 = p[0]! * 800 + p[3]! * 600 + p[6]! * 1;
      const y1 = p[1]! * 800 + p[4]! * 600 + p[7]! * 1;
      expect(x1).toBeCloseTo(1);
      expect(y1).toBeCloseTo(-1);
    });
  });
});
