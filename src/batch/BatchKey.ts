/**
 * Batch Key Utilities
 *
 * Functions for creating and comparing batch keys.
 */

import type { Color, BlendMode } from "../FeatureRenderer";
import type { BatchKey } from "./types";

/**
 * Hash a color into a 32-bit integer for fast comparison.
 *
 * @param color - RGBA color array (0-1 values)
 * @returns 32-bit hash
 */
export function hashColor(color: Color): number {
  const r = (color[0] * 255) | 0;
  const g = (color[1] * 255) | 0;
  const b = (color[2] * 255) | 0;
  const a = (color[3] * 255) | 0;
  return (r << 24) | (g << 16) | (b << 8) | a;
}

/**
 * Create a batch key for a feature.
 *
 * @param programType - Shader program type ("fill" or "stroke")
 * @param color - Feature color
 * @param strokeWidth - Stroke width in pixels (0 for fills)
 * @param blendMode - Blend mode for compositing
 * @param zIndex - Z-index for depth ordering
 * @returns BatchKey for grouping
 */
export function createBatchKey(
  programType: "fill" | "stroke",
  color: Color,
  strokeWidth: number,
  blendMode: BlendMode,
  zIndex: number
): BatchKey {
  return {
    programType,
    colorHash: hashColor(color),
    strokeWidth: programType === "stroke" ? strokeWidth : 0,
    blendMode,
    zIndex,
  };
}

/**
 * Compare two batch keys for equality.
 *
 * @param a - First batch key
 * @param b - Second batch key
 * @returns true if keys are equal
 */
export function batchKeyEquals(a: BatchKey, b: BatchKey): boolean {
  return (
    a.programType === b.programType &&
    a.colorHash === b.colorHash &&
    a.strokeWidth === b.strokeWidth &&
    a.blendMode === b.blendMode &&
    a.zIndex === b.zIndex
  );
}

/**
 * Convert a batch key to a unique string for map keys.
 *
 * @param key - Batch key
 * @returns String representation
 */
export function batchKeyToString(key: BatchKey): string {
  return `${key.programType}:${key.colorHash}:${key.strokeWidth}:${key.blendMode}:${key.zIndex}`;
}

/**
 * Compare batch keys for sorting.
 * Orders by z-index first, then fills before strokes.
 *
 * @param a - First batch key
 * @param b - Second batch key
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareBatchKeys(a: BatchKey, b: BatchKey): number {
  // Primary: z-index ascending
  if (a.zIndex !== b.zIndex) {
    return a.zIndex - b.zIndex;
  }
  // Secondary: fills before strokes
  if (a.programType !== b.programType) {
    return a.programType === "fill" ? -1 : 1;
  }
  return 0;
}
