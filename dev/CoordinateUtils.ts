/**
 * Coordinate transformation utilities for converting between
 * world coordinates and screen pixels.
 */

/** Convert world coordinates to screen pixels */
export function worldToScreen(
  worldX: number,
  worldY: number,
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number
): { screenX: number; screenY: number } {
  // Apply 3x3 matrix: clipX = matrix[0]*x + matrix[3]*y + matrix[6]
  const clipX = matrix[0]! * worldX + matrix[3]! * worldY + matrix[6]!;
  const clipY = matrix[1]! * worldX + matrix[4]! * worldY + matrix[7]!;

  // Clip space (-1,1) to screen pixels
  const screenX = (clipX + 1) * 0.5 * viewportWidth;
  const screenY = (1 - clipY) * 0.5 * viewportHeight; // Y flipped

  return { screenX, screenY };
}

/** Convert screen pixels to world coordinates (inverse of worldToScreen) */
export function screenToWorld(
  screenX: number,
  screenY: number,
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number
): { worldX: number; worldY: number } {
  // Screen to clip space
  const clipX = (screenX / viewportWidth) * 2 - 1;
  const clipY = 1 - (screenY / viewportHeight) * 2; // Y flipped

  // Invert 2x2 part of matrix (ignoring translation for now)
  // matrix is [a, b, 0, c, d, 0, tx, ty, 1] in column-major
  // For our camera matrix: a=scale, b=0, c=0, d=-scale, tx, ty
  const a = matrix[0]!, b = matrix[3]!;
  const c = matrix[1]!, d = matrix[4]!;
  const tx = matrix[6]!, ty = matrix[7]!;

  // Solve: clipX = a*x + b*y + tx, clipY = c*x + d*y + ty
  const det = a * d - b * c;
  const worldX = (d * (clipX - tx) - b * (clipY - ty)) / det;
  const worldY = (-c * (clipX - tx) + a * (clipY - ty)) / det;

  return { worldX, worldY };
}

/**
 * Check if object at worldX is visible with horizontal wrapping.
 * Returns the X coordinate to use for rendering if visible, or null if not visible.
 */
export function getWrappedX(
  worldX: number,
  radius: number,
  boundsLeft: number,
  boundsRight: number
): number | null {
  // Check primary position
  if (worldX + radius >= boundsLeft && worldX - radius <= boundsRight) {
    return worldX;
  }

  // Check wrapped +1 (for when camera is past x=1)
  const wrappedPlus = worldX + 1;
  if (wrappedPlus + radius >= boundsLeft && wrappedPlus - radius <= boundsRight) {
    return wrappedPlus;
  }

  // Check wrapped -1 (for when camera is before x=0)
  const wrappedMinus = worldX - 1;
  if (wrappedMinus + radius >= boundsLeft && wrappedMinus - radius <= boundsRight) {
    return wrappedMinus;
  }

  return null; // Not visible at any wrap position
}
