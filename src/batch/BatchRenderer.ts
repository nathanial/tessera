/**
 * Batch Renderer
 *
 * Groups features by style to minimize draw calls and GPU state changes.
 * Features with the same shader, color, stroke width, blend mode, and z-index
 * are merged into a single batch for efficient rendering.
 */

import { createProgram } from "../shaders/compile";
import { fillVertexShader, fillFragmentShader } from "../shaders/fill";
import { strokeVertexShader, strokeFragmentShader } from "../shaders/stroke";
import { setBlendMode, type BlendMode } from "../style/index";
import { BatchGroup } from "./BatchGroup";
import { batchKeyToString, compareBatchKeys } from "./BatchKey";
import type { BatchableFeature } from "./types";
import type { Mat4 } from "../math/mat4";

/**
 * Batched feature renderer for high-performance rendering.
 *
 * Reduces draw calls by grouping features with identical styles into
 * merged geometry batches.
 */
export class BatchRenderer {
  readonly gl: WebGL2RenderingContext;

  private fillProgram: WebGLProgram;
  private strokeProgram: WebGLProgram;

  private fillUniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
  };

  private strokeUniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
    halfWidth: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
  };

  private batches: Map<string, BatchGroup> = new Map();
  private sortedBatches: BatchGroup[] = [];
  private needsSort = true;
  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Create shader programs
    this.fillProgram = createProgram(gl, fillVertexShader, fillFragmentShader);
    this.strokeProgram = createProgram(
      gl,
      strokeVertexShader,
      strokeFragmentShader
    );

    // Cache uniform locations
    this.fillUniforms = {
      matrix: gl.getUniformLocation(this.fillProgram, "u_matrix")!,
      color: gl.getUniformLocation(this.fillProgram, "u_color")!,
    };

    this.strokeUniforms = {
      matrix: gl.getUniformLocation(this.strokeProgram, "u_matrix")!,
      color: gl.getUniformLocation(this.strokeProgram, "u_color")!,
      halfWidth: gl.getUniformLocation(this.strokeProgram, "u_halfWidth")!,
      viewport: gl.getUniformLocation(this.strokeProgram, "u_viewport")!,
    };
  }

  /**
   * Add a feature to the appropriate batch.
   *
   * @param feature - Batchable feature data
   */
  addFeature(feature: BatchableFeature): void {
    if (this._destroyed) return;

    const keyStr = batchKeyToString(feature.key);

    let batch = this.batches.get(keyStr);
    if (!batch) {
      batch = new BatchGroup(feature.key, feature.color);
      this.batches.set(keyStr, batch);
      this.needsSort = true;
    }

    batch.addGeometry(
      feature.vertices,
      feature.indices,
      feature.vertexStride,
      feature.attributes
    );
  }

  /**
   * Build all batch geometries and prepare for rendering.
   * Call this after adding all features and before rendering.
   */
  build(): void {
    if (this._destroyed) return;

    const gl = this.gl;

    for (const batch of this.batches.values()) {
      batch.build(gl);
    }

    if (this.needsSort) {
      this.sortBatches();
    }
  }

  private sortBatches(): void {
    this.sortedBatches = Array.from(this.batches.values())
      .filter((b) => !b.isEmpty)
      .sort((a, b) => compareBatchKeys(a.key, b.key));
    this.needsSort = false;
  }

  /**
   * Render all batches.
   *
   * @param matrix - View-projection matrix from Camera.getMatrix()
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  render(matrix: Mat4, viewportWidth: number, viewportHeight: number): void {
    if (this._destroyed || this.sortedBatches.length === 0) return;

    const gl = this.gl;

    gl.enable(gl.BLEND);

    let currentProgram: "fill" | "stroke" | null = null;
    let currentBlendMode: BlendMode | null = null;

    for (const batch of this.sortedBatches) {
      // Switch blend mode if needed
      if (batch.key.blendMode !== currentBlendMode) {
        currentBlendMode = batch.key.blendMode;
        setBlendMode(gl, currentBlendMode);
      }

      // Switch program if needed
      if (batch.key.programType !== currentProgram) {
        currentProgram = batch.key.programType;

        if (currentProgram === "fill") {
          gl.useProgram(this.fillProgram);
          gl.uniformMatrix4fv(this.fillUniforms.matrix, false, matrix);
        } else {
          gl.useProgram(this.strokeProgram);
          gl.uniformMatrix4fv(this.strokeUniforms.matrix, false, matrix);
          gl.uniform2f(
            this.strokeUniforms.viewport,
            viewportWidth,
            viewportHeight
          );
        }
      }

      // Set per-batch uniforms
      if (currentProgram === "fill") {
        gl.uniform4fv(this.fillUniforms.color, batch.color);
      } else {
        gl.uniform4fv(this.strokeUniforms.color, batch.color);
        gl.uniform1f(this.strokeUniforms.halfWidth, batch.key.strokeWidth / 2);
      }

      batch.draw();
    }

    gl.disable(gl.BLEND);
  }

  /**
   * Get the number of batches.
   */
  get batchCount(): number {
    return this.sortedBatches.length;
  }

  /**
   * Get total number of draw calls that will be made.
   */
  get drawCallCount(): number {
    return this.sortedBatches.length;
  }

  /**
   * Clear all batches.
   */
  clear(): void {
    for (const batch of this.batches.values()) {
      batch.destroy();
    }
    this.batches.clear();
    this.sortedBatches = [];
    this.needsSort = true;
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.clear();
    this.gl.deleteProgram(this.fillProgram);
    this.gl.deleteProgram(this.strokeProgram);

    this._destroyed = true;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }
}
