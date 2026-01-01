/**
 * Style System Types
 *
 * Enhanced styling options for Phase 3 rendering features.
 */

import type { Color } from "../FeatureRenderer";
import type { CapStyle } from "../geometry/index";

/** Blend modes for compositing */
export type BlendMode = "normal" | "add" | "multiply" | "screen";

/**
 * Enhanced feature style with Phase 3 additions.
 *
 * Extends the base FeatureStyle with z-index, opacity controls,
 * and blend modes for advanced rendering.
 */
export interface EnhancedFeatureStyle {
  /** Fill color for polygons (default: semi-transparent blue) */
  fillColor?: Color;
  /** Stroke color for lines and polygon outlines (default: dark blue) */
  strokeColor?: Color;
  /** Stroke width in pixels (default: 2) */
  strokeWidth?: number;
  /** Cap style for line ends (default: round) */
  strokeCap?: CapStyle;

  // Phase 3 additions

  /** Z-index for depth ordering (default: 0, higher = on top) */
  zIndex?: number;
  /** Overall opacity multiplier 0-1 (default: 1) */
  opacity?: number;
  /** Fill-specific opacity 0-1 (default: 1) */
  fillOpacity?: number;
  /** Stroke-specific opacity 0-1 (default: 1) */
  strokeOpacity?: number;
  /** Blend mode for compositing (default: "normal") */
  blendMode?: BlendMode;
}

/** Default values for enhanced style properties */
export const DEFAULT_ENHANCED_STYLE: Required<EnhancedFeatureStyle> = {
  fillColor: [0.2, 0.4, 0.8, 0.5],
  strokeColor: [0.1, 0.2, 0.4, 1.0],
  strokeWidth: 2,
  strokeCap: "round",
  zIndex: 0,
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  blendMode: "normal",
};

/**
 * Compute effective color with opacity applied.
 *
 * @param baseColor - Base RGBA color
 * @param opacity - Overall opacity multiplier
 * @param specificOpacity - Fill or stroke specific opacity
 * @returns Color with combined opacity
 */
export function computeEffectiveColor(
  baseColor: Color,
  opacity: number,
  specificOpacity: number
): Color {
  const effectiveAlpha = baseColor[3] * opacity * specificOpacity;
  return [baseColor[0], baseColor[1], baseColor[2], effectiveAlpha];
}
