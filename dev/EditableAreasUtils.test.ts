import { describe, expect, it } from "vitest";
import {
  angleBetween,
  computeGateCorners,
  computeGridBoundary,
  normalizeArc,
  offsetPolygon,
  pointInPolygon,
  type Vec2,
} from "./EditableAreasUtils";

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe("EditableAreasUtils", () => {
  it("detects points inside polygons", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: -0.2, y: 0.5 }, square)).toBe(false);
  });

  it("offsets polygons outward", () => {
    const expanded = offsetPolygon(square, 0.1);
    const xs = expanded.map((p) => p.x);
    const ys = expanded.map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(1);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(1);
  });

  it("computes grid boundary", () => {
    const grid: Vec2[][] = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    ];
    const boundary = computeGridBoundary(grid);
    expect(boundary).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("computes gate corners aligned with rotation", () => {
    const corners = computeGateCorners({ x: 0, y: 0 }, 2, 1, 0);
    expect(corners[0]).toEqual({ x: -1, y: -0.5 });
    expect(corners[2]).toEqual({ x: 1, y: 0.5 });
  });

  it("normalizes arc ordering", () => {
    const arc = normalizeArc(5.5, 0.5);
    expect(arc.end).toBeGreaterThan(arc.start);
    expect(angleBetween(0.1, 5.5, 0.5)).toBe(true);
  });
});
