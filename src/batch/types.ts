/**
 * Batch Renderer Types
 *
 * Types for batching draw calls to reduce GPU state changes.
 */

import type { Color, BlendMode } from "../FeatureRenderer";
import type { AttributeLayout } from "../Geometry";

/** Key for grouping features into batches */
export interface BatchKey {
  /** Shader program type */
  programType: "fill" | "stroke";
  /** Hash of the color for fast comparison */
  colorHash: number;
  /** Stroke width (0 for fills) */
  strokeWidth: number;
  /** Blend mode for compositing */
  blendMode: BlendMode;
  /** Z-index for depth ordering */
  zIndex: number;
}

/** Feature data that can be batched */
export interface BatchableFeature {
  /** Batch key for grouping */
  key: BatchKey;
  /** Vertex data */
  vertices: Float32Array;
  /** Index data */
  indices: Uint16Array | Uint32Array;
  /** Bytes per vertex */
  vertexStride: number;
  /** Attribute layout for vertex buffer */
  attributes: AttributeLayout[];
  /** Original color (stored for uniform) */
  color: Color;
}

/** Render command for a single batch */
export interface BatchRenderCommand {
  /** Batch key */
  key: BatchKey;
  /** Color uniform */
  color: Color;
  /** Number of elements to draw */
  elementCount: number;
}
