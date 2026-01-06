/**
 * Tessera - A zero-dependency, hardware-accelerated 3D terrain rendering engine
 */

export const VERSION = "0.0.1";

export { Tessera, type TesseraOptions } from "./Tessera";
export { Camera3D } from "./Camera3D";
export { Camera } from "./Camera";
export { TileManager, type TileCoord, type LoadedTile, type FallbackTile } from "./TileManager";
export { Buffer, type BufferTarget, type BufferUsage } from "./Buffer";
export { Geometry, type AttributeLayout, type GeometryOptions } from "./Geometry";
export * as mat3 from "./math/mat3";
export * as mat4 from "./math/mat4";
export * as vec3 from "./math/vec3";

// Terrain module
export {
  TerrainTileManager,
  type TerrainMeshData,
} from "./terrain/TerrainTileManager";
export {
  TerrainMesh,
  TerrainMeshCache,
} from "./terrain/TerrainMesh";
export { HeightSampler } from "./terrain/HeightSampler";
export {
  parseQuantizedMesh,
  tileToMercatorBounds,
  quantizedHeightToWorld,
  HEIGHT_EXAGGERATION,
  HEIGHT_SCALE,
  EARTH_CIRCUMFERENCE,
  type TerrainTileHeader,
  type TerrainTileData,
  type TileCoord as TerrainTileCoord,
} from "./terrain/TerrainTileLoader";

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

// Phase 0: Immediate Mode API
export { DrawContext, DrawState, DynamicBuffer, PathBuilder } from "./immediate/index";
export type {
  DrawContextOptions,
  Color as ImmediateColor,
  LineCap,
  LineJoin,
  DrawStateValues,
  DynamicBufferType,
  Coord,
} from "./immediate/index";

// Geographic projection utilities
export { lonLatToTessera, tesseraToLonLat } from "./geo/index";
