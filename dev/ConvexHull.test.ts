import { describe, it, expect } from "vitest";
import { convexHull, offsetConvexPolygon } from "./ConvexHull";

describe("convexHull", () => {
  it("returns the hull of a square with interior points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.8 },
    ];
    const hull = convexHull(points);
    expect(hull.length).toBe(4);
    const keys = new Set(hull.map(p => `${p.x},${p.y}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("1,0")).toBe(true);
    expect(keys.has("1,1")).toBe(true);
    expect(keys.has("0,1")).toBe(true);
  });

  it("handles colinear points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const hull = convexHull(points);
    expect(hull.length).toBe(2);
    expect(hull[0]!.x).toBe(0);
    expect(hull[1]!.x).toBe(3);
  });

  it("expands a convex polygon with padding", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const padded = offsetConvexPolygon(square, 0.2);
    const xs = padded.map(p => p.x);
    const ys = padded.map(p => p.y);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(1);
    expect(Math.max(...ys)).toBeGreaterThan(1);
  });
});
