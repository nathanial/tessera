/**
 * Convex hull (Monotonic chain) in 2D.
 */

export interface HullPoint {
  x: number;
  y: number;
}

function cross(o: HullPoint, a: HullPoint, b: HullPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function polygonArea(points: HullPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function lineIntersection(
  p1: HullPoint,
  d1: HullPoint,
  p2: HullPoint,
  d2: HullPoint
): HullPoint | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

export function offsetConvexPolygon(points: HullPoint[], padding: number): HullPoint[] {
  if (points.length < 3 || padding <= 0) return points.slice();

  const area = polygonArea(points);
  const sign = area >= 0 ? 1 : -1;
  const count = points.length;
  const normals: HullPoint[] = new Array(count);
  const lines: Array<{ p: HullPoint; d: HullPoint } | null> = new Array(count);

  for (let i = 0; i < count; i++) {
    const p0 = points[i]!;
    const p1 = points[(i + 1) % count]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      normals[i] = { x: 0, y: 0 };
      lines[i] = null;
      continue;
    }
    const nx = (dy / len) * sign;
    const ny = (-dx / len) * sign;
    normals[i] = { x: nx, y: ny };
    lines[i] = {
      p: { x: p0.x + nx * padding, y: p0.y + ny * padding },
      d: { x: dx, y: dy },
    };
  }

  const result: HullPoint[] = [];
  for (let i = 0; i < count; i++) {
    const prev = lines[(i - 1 + count) % count];
    const curr = lines[i];
    if (prev && curr) {
      const intersection = lineIntersection(prev.p, prev.d, curr.p, curr.d);
      if (intersection) {
        result.push(intersection);
        continue;
      }
    }

    const nPrev = normals[(i - 1 + count) % count];
    const nCurr = normals[i];
    const avg = { x: nPrev.x + nCurr.x, y: nPrev.y + nCurr.y };
    const len = Math.hypot(avg.x, avg.y);
    if (len > 1e-6) {
      result.push({
        x: points[i]!.x + (avg.x / len) * padding,
        y: points[i]!.y + (avg.y / len) * padding,
      });
    } else {
      result.push({
        x: points[i]!.x + nCurr.x * padding,
        y: points[i]!.y + nCurr.y * padding,
      });
    }
  }

  return result;
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
