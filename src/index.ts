/**
 * Tessera - A zero-dependency, hardware-accelerated 2D vector rendering engine
 */

export const VERSION = "0.0.1";

export { Tessera, type TesseraOptions } from "./Tessera";
export { Camera } from "./Camera";
export { TileManager, type TileCoord, type LoadedTile } from "./TileManager";
export { Buffer, type BufferTarget, type BufferUsage } from "./Buffer";
export { Geometry, type AttributeLayout, type GeometryOptions } from "./Geometry";
export * as mat3 from "./math/mat3";

// Phase 2: Geometry Pipeline
export { FeatureRenderer, type Color, type FeatureStyle, type BlendMode } from "./FeatureRenderer";
export * from "./geometry/index";

// Phase 3: Style System
export { setBlendMode, computeEffectiveColor } from "./style/index";
export type { EnhancedFeatureStyle } from "./style/index";

// Phase 3: Batch Rendering
export { BatchRenderer, BatchGroup } from "./batch/index";
export { createBatchKey, hashColor, batchKeyToString } from "./batch/index";
export type { BatchKey, BatchableFeature } from "./batch/index";

// Phase 3: Instanced Rendering
export { InstancedPointRenderer, createShapeGeometry } from "./instanced/index";
export type { PointShape, PointInstance, ShapeGeometry } from "./instanced/index";

// Phase 3: SDF Text & Icons
export { SDFRenderer, TextLayout, createFontAtlas } from "./sdf/index";
export type {
  FontAtlasMetadata,
  IconAtlasMetadata,
  GlyphMetrics,
  IconMetrics,
  TextStyle,
  IconStyle,
  TextMeasurement,
  LayoutOptions,
  FontAtlasOptions,
  GeneratedFontAtlas,
} from "./sdf/index";
