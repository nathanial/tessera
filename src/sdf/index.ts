/**
 * SDF Rendering Module
 *
 * Signed Distance Field text and icon rendering for crisp labels at any scale.
 */

export { SDFRenderer } from "./SDFRenderer";
export { TextLayout, type TextMeasurement, type LayoutOptions } from "./TextLayout";
export {
  DEFAULT_TEXT_STYLE,
  DEFAULT_ICON_STYLE,
  type FontAtlasMetadata,
  type IconAtlasMetadata,
  type GlyphMetrics,
  type IconMetrics,
  type KerningPair,
  type TextStyle,
  type IconStyle,
} from "./types";
