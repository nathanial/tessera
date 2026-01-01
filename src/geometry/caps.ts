/**
 * Line cap geometry generation
 */

import type { Vec2 } from "../math/vec2";

/** Number of segments for round caps */
const ROUND_CAP_SEGMENTS = 8;

/**
 * Add vertices for a round cap.
 * @param vertices - Vertex array to append to
 * @param indices - Index array to append to
 * @param point - Cap center point
 * @param normal - Normal direction at cap
 * @param isStart - True for start cap, false for end cap
 * @param baseIndex - Starting vertex index
 * @returns Next available vertex index
 */
export function addRoundCap(
  vertices: number[],
  indices: number[],
  point: Vec2,
  normal: Vec2,
  isStart: boolean,
  baseIndex: number
): number {
  const centerIndex = baseIndex;
  const startAngle = Math.atan2(normal[1], normal[0]);

  // Center vertex (no extrusion)
  vertices.push(point[0], point[1], 0, 0, 0);

  // Arc vertices
  for (let i = 0; i <= ROUND_CAP_SEGMENTS; i++) {
    const t = i / ROUND_CAP_SEGMENTS;
    const angle =
      startAngle + (isStart ? Math.PI : 0) + t * Math.PI * (isStart ? 1 : -1);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    vertices.push(point[0], point[1], nx, ny, 1);
  }

  // Fan triangles
  for (let i = 0; i < ROUND_CAP_SEGMENTS; i++) {
    indices.push(centerIndex, centerIndex + 1 + i, centerIndex + 2 + i);
  }

  return baseIndex + 2 + ROUND_CAP_SEGMENTS;
}

/**
 * Add vertices for a square cap.
 * @param vertices - Vertex array to append to
 * @param indices - Index array to append to
 * @param point - Cap center point
 * @param normal - Normal direction at cap
 * @param direction - Line direction at cap
 * @param isStart - True for start cap, false for end cap
 * @param baseIndex - Starting vertex index
 * @returns Next available vertex index
 */
export function addSquareCap(
  vertices: number[],
  indices: number[],
  point: Vec2,
  normal: Vec2,
  direction: Vec2,
  isStart: boolean,
  baseIndex: number
): number {
  // Extend in the line direction
  const sign = isStart ? -1 : 1;
  const extX = direction[0] * sign;
  const extY = direction[1] * sign;

  // Add four vertices for the square extension
  // Two at the current point (connected to line), two extended
  vertices.push(
    point[0], point[1], normal[0], normal[1], 1, // left at point
    point[0], point[1], normal[0], normal[1], -1, // right at point
    point[0], point[1], extX + normal[0], extY + normal[1], 1, // left extended
    point[0], point[1], extX + normal[0], extY + normal[1], -1 // right extended
  );

  // Two triangles for the square
  indices.push(
    baseIndex, baseIndex + 1, baseIndex + 2,
    baseIndex + 1, baseIndex + 3, baseIndex + 2
  );

  return baseIndex + 4;
}
