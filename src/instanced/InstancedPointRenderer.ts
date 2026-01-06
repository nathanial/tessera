/**
 * Instanced Point Renderer
 *
 * Efficiently renders thousands of points in a single draw call using GPU instancing.
 * Each point can have its own position, color, size, and rotation.
 */

import { Buffer } from "../Buffer";
import { createProgram } from "../shaders/compile";
import {
  instancedPointVertexShader,
  instancedPointFragmentShader,
} from "./shaders";
import { createShapeGeometry } from "./shapes";
import type { PointShape, PointInstance, ShapeGeometry } from "./types";
import type { Mat4 } from "../math/mat4";

/** Bytes per float */
const FLOAT_SIZE = 4;

/** Instance data layout: x, y, r, g, b, a, size, rotation */
const INSTANCE_FLOATS = 8;
const INSTANCE_STRIDE = INSTANCE_FLOATS * FLOAT_SIZE;

/**
 * GPU-instanced point/marker renderer.
 *
 * Renders many points with a single draw call for excellent performance.
 * Supports multiple shapes: circle, square, triangle, diamond.
 */
export class InstancedPointRenderer {
  readonly gl: WebGL2RenderingContext;

  private program: WebGLProgram;
  private uniforms: {
    matrix: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
  };

  // VAO for the complete setup
  private vao: WebGLVertexArrayObject;

  // Shape geometry (shared across instances)
  private shapeVertexBuffer: Buffer;
  private shapeIndexBuffer: Buffer;
  private shapeIndexCount = 0;

  // Instance data buffer
  private instanceBuffer: Buffer;
  private instanceCount = 0;

  private currentShape: PointShape | null = null;
  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Create shader program
    this.program = createProgram(
      gl,
      instancedPointVertexShader,
      instancedPointFragmentShader
    );

    // Cache uniform locations
    this.uniforms = {
      matrix: gl.getUniformLocation(this.program, "u_matrix")!,
      viewport: gl.getUniformLocation(this.program, "u_viewport")!,
    };

    // Create VAO
    this.vao = gl.createVertexArray()!;

    // Create buffers
    this.shapeVertexBuffer = new Buffer(gl, "array", "static");
    this.shapeIndexBuffer = new Buffer(gl, "element", "static");
    this.instanceBuffer = new Buffer(gl, "array", "dynamic");
  }

  /**
   * Set the shape and instances to render.
   *
   * @param shape - Shape type for all points
   * @param instances - Array of point instances
   */
  setInstances(shape: PointShape, instances: PointInstance[]): void {
    if (this._destroyed) return;

    const gl = this.gl;

    // Rebuild shape geometry if shape changed
    if (shape !== this.currentShape) {
      this.currentShape = shape;
      const shapeGeom = createShapeGeometry(shape);
      this.shapeVertexBuffer.setData(shapeGeom.vertices);
      this.shapeIndexBuffer.setData(shapeGeom.indices);
      this.shapeIndexCount = shapeGeom.indices.length;
      this.setupVAO(shapeGeom);
    }

    // Build instance data buffer
    const instanceData = new Float32Array(instances.length * INSTANCE_FLOATS);

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      const offset = i * INSTANCE_FLOATS;

      instanceData[offset + 0] = inst.position[0];
      instanceData[offset + 1] = inst.position[1];
      instanceData[offset + 2] = inst.color[0];
      instanceData[offset + 3] = inst.color[1];
      instanceData[offset + 4] = inst.color[2];
      instanceData[offset + 5] = inst.color[3];
      instanceData[offset + 6] = inst.size;
      instanceData[offset + 7] = inst.rotation ?? 0;
    }

    this.instanceBuffer.setData(instanceData);
    this.instanceCount = instances.length;

    // Re-setup VAO to bind updated instance buffer
    const shapeGeom = createShapeGeometry(shape);
    this.setupVAO(shapeGeom);
  }

  private setupVAO(shapeGeom: ShapeGeometry): void {
    const gl = this.gl;

    gl.bindVertexArray(this.vao);

    // Shape geometry (per-vertex) - location 0
    this.shapeVertexBuffer.bind();
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance attributes
    this.instanceBuffer.bind();

    // a_instancePosition (location 1) - 2 floats at offset 0
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, INSTANCE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1); // One per instance

    // a_instanceColor (location 2) - 4 floats at offset 8
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, INSTANCE_STRIDE, 2 * FLOAT_SIZE);
    gl.vertexAttribDivisor(2, 1);

    // a_instanceSize (location 3) - 1 float at offset 24
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, INSTANCE_STRIDE, 6 * FLOAT_SIZE);
    gl.vertexAttribDivisor(3, 1);

    // a_instanceRotation (location 4) - 1 float at offset 28
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, INSTANCE_STRIDE, 7 * FLOAT_SIZE);
    gl.vertexAttribDivisor(4, 1);

    // Bind index buffer
    this.shapeIndexBuffer.bind();

    gl.bindVertexArray(null);
  }

  /**
   * Render all instances.
   *
   * @param matrix - View-projection matrix from Camera.getMatrix()
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  render(matrix: Mat4, viewportWidth: number, viewportHeight: number): void {
    if (this._destroyed || this.instanceCount === 0) return;

    const gl = this.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.matrix, false, matrix);
    gl.uniform2f(this.uniforms.viewport, viewportWidth, viewportHeight);

    gl.bindVertexArray(this.vao);

    // Draw all instances with a single draw call
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      this.shapeIndexCount,
      gl.UNSIGNED_SHORT,
      0,
      this.instanceCount
    );

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  /**
   * Get the number of instances.
   */
  get count(): number {
    return this.instanceCount;
  }

  /**
   * Clear all instances.
   */
  clear(): void {
    this.instanceCount = 0;
  }

  /**
   * Clean up all GPU resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.shapeVertexBuffer.destroy();
    this.shapeIndexBuffer.destroy();
    this.instanceBuffer.destroy();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);

    this._destroyed = true;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }
}
