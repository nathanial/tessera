/**
 * Batch Group
 *
 * Merges multiple feature geometries into a single GPU buffer for efficient rendering.
 */

import { Geometry, type AttributeLayout } from "../Geometry";
import type { Color } from "../FeatureRenderer";
import type { BatchKey } from "./types";

/**
 * A group of features with the same batch key that can be drawn in a single call.
 */
export class BatchGroup {
  /** The batch key for this group */
  readonly key: BatchKey;
  /** The color for this group (all features have the same color) */
  readonly color: Color;

  private vertices: number[] = [];
  private indices: number[] = [];
  private vertexCount = 0;
  private vertexStride = 0;
  private attributes: AttributeLayout[] = [];
  private geometry?: Geometry;
  private dirty = true;
  private _destroyed = false;

  constructor(key: BatchKey, color: Color) {
    this.key = key;
    this.color = color;
  }

  /**
   * Add feature geometry to this batch.
   *
   * @param featureVertices - Vertex data
   * @param featureIndices - Index data
   * @param stride - Bytes per vertex
   * @param attributes - Attribute layout (used for first feature only)
   */
  addGeometry(
    featureVertices: Float32Array,
    featureIndices: Uint16Array | Uint32Array,
    stride: number,
    attributes: AttributeLayout[]
  ): void {
    if (this._destroyed) return;

    // Store attribute layout from first feature
    if (this.vertices.length === 0) {
      this.vertexStride = stride;
      this.attributes = attributes;
    }

    const floatsPerVertex = stride / 4;
    const indexOffset = this.vertexCount;

    // Append vertices
    for (let i = 0; i < featureVertices.length; i++) {
      this.vertices.push(featureVertices[i]!);
    }

    // Append indices with offset
    for (let i = 0; i < featureIndices.length; i++) {
      this.indices.push(featureIndices[i]! + indexOffset);
    }

    this.vertexCount += featureVertices.length / floatsPerVertex;
    this.dirty = true;
  }

  /**
   * Build GPU geometry from accumulated data.
   * Call this before rendering.
   *
   * @param gl - WebGL2 rendering context
   */
  build(gl: WebGL2RenderingContext): void {
    if (this._destroyed || !this.dirty || this.vertices.length === 0) return;

    // Destroy old geometry
    this.geometry?.destroy();

    const vertices = new Float32Array(this.vertices);
    const indices =
      this.vertexCount > 65535
        ? new Uint32Array(this.indices)
        : new Uint16Array(this.indices);

    this.geometry = new Geometry(gl, {
      vertices,
      indices,
      attributes: this.attributes,
      usage: "static",
    });

    this.dirty = false;
  }

  /**
   * Draw the batch geometry.
   */
  draw(): void {
    if (this._destroyed || !this.geometry) return;
    this.geometry.draw();
  }

  /**
   * Get the number of elements (triangles * 3) in this batch.
   */
  get elementCount(): number {
    return this.indices.length;
  }

  /**
   * Check if this batch is empty.
   */
  get isEmpty(): boolean {
    return this.vertices.length === 0;
  }

  /**
   * Clean up GPU resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.geometry?.destroy();
    this.geometry = undefined;
    this.vertices = [];
    this.indices = [];
    this._destroyed = true;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }
}
