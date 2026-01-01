/**
 * 2D vector utilities for geometry processing
 */

/** 2D vector as [x, y] tuple */
export type Vec2 = [number, number];

/**
 * Normalize a 2D vector.
 * Returns a new normalized vector (does not mutate input).
 */
export function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (len > 0) {
    return [v[0] / len, v[1] / len];
  }
  return [0, 0];
}

/**
 * Compute perpendicular normal to a segment (90 degrees CCW).
 */
export function perpendicular(dx: number, dy: number): Vec2 {
  return normalize([-dy, dx]);
}

/**
 * Compute miter direction and scale for a corner.
 * @param n1 - Normal of first segment
 * @param n2 - Normal of second segment
 * @param miterLimit - Maximum miter scale before clamping
 * @returns [miterX, miterY, miterScale]
 */
export function computeMiter(
  n1: Vec2,
  n2: Vec2,
  miterLimit: number
): [number, number, number] {
  // Miter direction is the average of the two normals
  let mx = n1[0] + n2[0];
  let my = n1[1] + n2[1];
  const len = Math.sqrt(mx * mx + my * my);

  if (len < 0.0001) {
    // Parallel lines (180-degree turn), use n1
    return [n1[0], n1[1], 1];
  }

  mx /= len;
  my /= len;

  // Miter scale = 1 / dot(miter, normal)
  const dot = mx * n1[0] + my * n1[1];
  let scale = Math.abs(dot) > 0.0001 ? 1 / dot : 1;

  // Apply miter limit
  scale = Math.min(scale, miterLimit);

  return [mx, my, scale];
}
