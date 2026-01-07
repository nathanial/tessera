/**
 * Instanced Rendering Types
 *
 * Types for efficient point/marker rendering using GPU instancing.
 */

import type { Color } from "../types/color";

/** Available point shapes */
export type PointShape = "circle" | "square" | "triangle" | "diamond";

/** A single point instance to be rendered */
export interface PointInstance {
  /** World position [x, y] */
  position: [number, number];
  /** RGBA color (0-1 values) */
  color: Color;
  /** Size in pixels (diameter) */
  size: number;
  /** Rotation in radians (default: 0) */
  rotation?: number;
}

/** Shape geometry data */
export interface ShapeGeometry {
  /** Vertex positions (x, y pairs) */
  vertices: Float32Array;
  /** Triangle indices */
  indices: Uint16Array;
  /** Number of vertices */
  vertexCount: number;
}
