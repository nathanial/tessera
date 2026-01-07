/**
 * SDF Rendering Types
 *
 * Types for Signed Distance Field text and icon rendering.
 */

import type { Color } from "../types/color";

/** Metrics for a single glyph in the font atlas */
export interface GlyphMetrics {
  /** Unicode code point */
  id: number;
  /** Position in atlas texture (pixels) */
  x: number;
  y: number;
  /** Size in atlas texture (pixels) */
  width: number;
  height: number;
  /** Offset from cursor to glyph origin (pixels, at base font size) */
  xOffset: number;
  yOffset: number;
  /** Horizontal advance after rendering this glyph (pixels, at base font size) */
  xAdvance: number;
}

/** Kerning pair for precise spacing */
export interface KerningPair {
  /** First character code */
  first: number;
  /** Second character code */
  second: number;
  /** Kerning amount (pixels, at base font size) */
  amount: number;
}

/** Complete font atlas metadata */
export interface FontAtlasMetadata {
  /** Font family name */
  name: string;
  /** Base font size the atlas was generated at (typically 32-48px) */
  size: number;
  /** Atlas texture dimensions */
  atlasWidth: number;
  atlasHeight: number;
  /** SDF spread (distance field radius in pixels) */
  sdfSpread: number;
  /** Line height (pixels, at base font size) */
  lineHeight: number;
  /** Baseline offset from top (pixels, at base font size) */
  baseline: number;
  /** Glyph metrics indexed by character code */
  glyphs: Record<number, GlyphMetrics>;
  /** Optional kerning pairs */
  kerning?: KerningPair[];
}

/** Metrics for a single icon in the atlas */
export interface IconMetrics {
  /** Unique icon identifier */
  id: string;
  /** Position in atlas texture (pixels) */
  x: number;
  y: number;
  /** Size in atlas texture (pixels) */
  width: number;
  height: number;
  /** Anchor point offset from center (normalized 0-1) */
  anchorX: number;
  anchorY: number;
}

/** Complete icon atlas metadata */
export interface IconAtlasMetadata {
  /** Atlas name/identifier */
  name: string;
  /** Atlas texture dimensions */
  atlasWidth: number;
  atlasHeight: number;
  /** SDF spread (distance field radius in pixels) */
  sdfSpread: number;
  /** Icon metrics indexed by icon ID */
  icons: Record<string, IconMetrics>;
}

/** Text style options */
export interface TextStyle {
  /** Text color (default: black) */
  color?: Color;
  /** Font size in pixels (default: 16) */
  fontSize?: number;
  /** Opacity (default: 1.0) */
  opacity?: number;
  /** Text alignment: 'left' | 'center' | 'right' (default: 'left') */
  align?: "left" | "center" | "right";
  /** Halo/outline color (optional) */
  haloColor?: Color;
  /** Halo width in pixels (default: 0, no halo) */
  haloWidth?: number;
  /** Rotation in radians (default: 0) */
  rotation?: number;
}

/** Icon style options */
export interface IconStyle {
  /** Icon color/tint (default: white, no tint) */
  color?: Color;
  /** Icon size in pixels (default: 24) */
  size?: number;
  /** Opacity (default: 1.0) */
  opacity?: number;
  /** Rotation in radians (default: 0) */
  rotation?: number;
}

/** Default text style values */
export const DEFAULT_TEXT_STYLE: Required<TextStyle> = {
  color: [0, 0, 0, 1],
  fontSize: 16,
  opacity: 1.0,
  align: "left",
  haloColor: [1, 1, 1, 0],
  haloWidth: 0,
  rotation: 0,
};

/** Default icon style values */
export const DEFAULT_ICON_STYLE: Required<IconStyle> = {
  color: [1, 1, 1, 1],
  size: 24,
  opacity: 1.0,
  rotation: 0,
};
