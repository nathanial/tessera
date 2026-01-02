/**
 * Utility helpers for editable area geometry.
 */

import ClipperLib from "clipper-lib";

export interface Vec2 {
  x: number;
  y: number;
}

export type Color = [number, number, number, number];

const TAU = Math.PI * 2;

export function normalizeAngle(angle: number): number {
  let a = angle % TAU;
  if (a < 0) a += TAU;
  return a;
}

export function normalizeArc(startAngle: number, endAngle: number): { start: number; end: number } {
  const start = normalizeAngle(startAngle);
  let end = normalizeAngle(endAngle);
  if (end <= start) {
    end += TAU;
  }
  return { start, end };
}

export function angleBetween(angle: number, startAngle: number, endAngle: number): boolean {
  const norm = normalizeArc(startAngle, endAngle);
  let a = normalizeAngle(angle);
  if (a < norm.start) a += TAU;
  return a >= norm.start && a <= norm.end;
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function polygonBounds(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      (pi.y > point.y) !== (pj.y > point.y) &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function offsetPolygon(points: Vec2[], offset: number): Vec2[] {
  if (points.length < 3 || Math.abs(offset) < 1e-8) return points.slice();

  const scale = 1_000_000;
  const scaledOffset = Math.round(offset * scale);
  if (scaledOffset === 0) return points.slice();

  const path = points.map((p) => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }));

  const arcTolerance = Math.max(1, Math.round(Math.abs(scaledOffset) * 0.25));
  const offsetter = new ClipperLib.ClipperOffset(2, arcTolerance);
  offsetter.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const solution: Array<Array<{ X: number; Y: number }>> = [];
  offsetter.Execute(solution, scaledOffset);

  if (solution.length === 0) return points.slice();

  let best = solution[0]!;
  let bestArea = Math.abs(ClipperLib.Clipper.Area(best));
  for (let i = 1; i < solution.length; i++) {
    const area = Math.abs(ClipperLib.Clipper.Area(solution[i]!));
    if (area > bestArea) {
      bestArea = area;
      best = solution[i]!;
    }
  }

  return best.map((p) => ({ x: p.X / scale, y: p.Y / scale }));
}

export function computeGridBoundary(grid: Vec2[][]): Vec2[] {
  const rows = grid.length;
  if (rows === 0) return [];
  const cols = grid[0]?.length ?? 0;
  if (cols === 0) return [];

  const boundary: Vec2[] = [];

  for (let c = 0; c < cols; c++) {
    boundary.push(grid[0]![c]!);
  }
  for (let r = 1; r < rows; r++) {
    boundary.push(grid[r]![cols - 1]!);
  }
  if (rows > 1) {
    for (let c = cols - 2; c >= 0; c--) {
      boundary.push(grid[rows - 1]![c]!);
    }
  }
  if (cols > 1) {
    for (let r = rows - 2; r > 0; r--) {
      boundary.push(grid[r]![0]!);
    }
  }

  return boundary;
}

export function computeGateCorners(
  center: Vec2,
  length: number,
  width: number,
  rotation: number
): Vec2[] {
  const halfLength = Math.max(0.001, length * 0.5);
  const halfWidth = Math.max(0.001, width * 0.5);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dir = { x: cos, y: sin };
  const perp = { x: -sin, y: cos };

  return [
    {
      x: center.x - dir.x * halfLength - perp.x * halfWidth,
      y: center.y - dir.y * halfLength - perp.y * halfWidth,
    },
    {
      x: center.x + dir.x * halfLength - perp.x * halfWidth,
      y: center.y + dir.y * halfLength - perp.y * halfWidth,
    },
    {
      x: center.x + dir.x * halfLength + perp.x * halfWidth,
      y: center.y + dir.y * halfLength + perp.y * halfWidth,
    },
    {
      x: center.x - dir.x * halfLength + perp.x * halfWidth,
      y: center.y - dir.y * halfLength + perp.y * halfWidth,
    },
  ];
}

export function findNearestPoint(point: Vec2, points: Vec2[], radius: number): Vec2 | null {
  const radiusSq = radius * radius;
  let best: Vec2 | null = null;
  let bestSq = radiusSq;
  for (const p of points) {
    const d = distanceSquared(point, p);
    if (d <= bestSq) {
      bestSq = d;
      best = p;
    }
  }
  return best;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const TAU_CONST = TAU;
