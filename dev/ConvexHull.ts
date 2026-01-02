/**
 * Convex hull (Monotonic chain) in 2D.
 */

import ClipperLib from "clipper-lib";

export interface HullPoint {
  x: number;
  y: number;
}

function cross(o: HullPoint, a: HullPoint, b: HullPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function offsetConvexPolygon(points: HullPoint[], padding: number): HullPoint[] {
  if (points.length < 3 || padding <= 0) return points.slice();

  const scale = 1_000_000;
  const scaledPadding = Math.max(1, Math.round(padding * scale));
  const path = points.map((p) => ({
    X: Math.round(p.x * scale),
    Y: Math.round(p.y * scale),
  }));

  const arcTolerance = Math.max(1, Math.round(scaledPadding * 0.25));
  const offset = new ClipperLib.ClipperOffset(2, arcTolerance);
  offset.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution: Array<Array<{ X: number; Y: number }>> = [];
  offset.Execute(solution, scaledPadding);

  if (solution.length === 0) return points.slice();

  let best = solution[0]!;
  let bestArea = Math.abs(ClipperLib.Clipper.Area(best));
  for (let i = 1; i < solution.length; i++) {
    const area = Math.abs(ClipperLib.Clipper.Area(solution[i]!));
    if (area > bestArea) {
      best = solution[i]!;
      bestArea = area;
    }
  }

  return best.map((p) => ({ x: p.X / scale, y: p.Y / scale }));
}

export function convexHull(points: HullPoint[]): HullPoint[] {
  if (points.length <= 1) {
    return points.slice();
  }

  const unique = new Map<string, HullPoint>();
  for (const p of points) {
    unique.set(`${p.x.toFixed(6)},${p.y.toFixed(6)}`, p);
  }

  const pts = Array.from(unique.values()).sort((a, b) => {
    if (a.x === b.x) return a.y - b.y;
    return a.x - b.x;
  });

  if (pts.length <= 2) {
    return pts.slice();
  }

  const lower: HullPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: HullPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();

  return lower.concat(upper);
}
