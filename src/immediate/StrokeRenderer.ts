/**
 * Stroke renderer - handles stroke program, VAO, and batch rendering.
 */

import { createStrokeProgramInfo } from "../shaders/programs";
import { DynamicBuffer } from "./DynamicBuffer";
import type { Color } from "./DrawState";
import type { Mat3 } from "../math/mat3";

// WebGL constants
const GL_FLOAT = 0x1406;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_TRIANGLES = 0x0004;

export interface StrokeBatch {
  color: Color;
  lineWidth: number;
  vertexOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
}

export class StrokeRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  readonly vertices: DynamicBuffer;
  readonly indices: DynamicBuffer;

  private batches: StrokeBatch[] = [];

  // Attribute locations
  private positionAttrib: number;
  private normalAttrib: number;
  private sideAttrib: number;

  // Uniform locations
  private matrixUniform: WebGLUniformLocation;
  private colorUniform: WebGLUniformLocation;
  private halfWidthUniform: WebGLUniformLocation;
  private viewportUniform: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    const programInfo = createStrokeProgramInfo(gl);
    this.program = programInfo.program;
    this.positionAttrib = programInfo.attribs.position;
    this.normalAttrib = programInfo.attribs.normal;
    this.sideAttrib = programInfo.attribs.side;
    this.matrixUniform = programInfo.uniforms.matrix;
    this.colorUniform = programInfo.uniforms.color;
    this.halfWidthUniform = programInfo.uniforms.halfWidth;
    this.viewportUniform = programInfo.uniforms.viewport;

    // Create dynamic buffers
    this.vertices = new DynamicBuffer(gl, "vertex", 4096);
    this.indices = new DynamicBuffer(gl, "index", 2048);

    // Create VAO
    this.vao = this.createVao();
  }

  private createVao(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    this.vertices.bind();

    // Stride: 5 floats = 20 bytes (x, y, nx, ny, side)
    const stride = 20;

    if (this.positionAttrib >= 0) {
      gl.enableVertexAttribArray(this.positionAttrib);
      gl.vertexAttribPointer(this.positionAttrib, 2, GL_FLOAT, false, stride, 0);
    }

    if (this.normalAttrib >= 0) {
      gl.enableVertexAttribArray(this.normalAttrib);
      gl.vertexAttribPointer(this.normalAttrib, 2, GL_FLOAT, false, stride, 8);
    }

    if (this.sideAttrib >= 0) {
      gl.enableVertexAttribArray(this.sideAttrib);
      gl.vertexAttribPointer(this.sideAttrib, 1, GL_FLOAT, false, stride, 16);
    }

    this.indices.bind();

    gl.bindVertexArray(null);
    return vao;
  }

  /** Reset for new frame. */
  reset(): void {
    this.vertices.reset();
    this.indices.reset();
    this.batches = [];
  }

  /** Add a stroke batch. */
  addBatch(
    color: Color,
    lineWidth: number,
    vertexOffset: number,
    vertexCount: number,
    indexOffset: number,
    indexCount: number
  ): void {
    this.batches.push({
      color,
      lineWidth,
      vertexOffset,
      vertexCount,
      indexOffset,
      indexCount,
    });
  }

  /** Check if there are batches to render. */
  hasBatches(): boolean {
    return this.batches.length > 0;
  }

  /** Render all batches. */
  render(matrix: Mat3, viewportWidth: number, viewportHeight: number): void {
    if (this.batches.length === 0) return;

    const gl = this.gl;

    // Upload data
    this.vertices.upload();
    this.indices.upload();

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.matrixUniform, false, matrix);
    gl.uniform2f(this.viewportUniform, viewportWidth, viewportHeight);

    // Bind VAO and buffers
    gl.bindVertexArray(this.vao);
    this.vertices.bind();
    this.indices.bind();

    for (const batch of this.batches) {
      gl.uniform4fv(this.colorUniform, batch.color);
      gl.uniform1f(this.halfWidthUniform, batch.lineWidth / 2);

      const indexType = this.indices.isUint32 ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
      const bytesPerIndex = this.indices.isUint32 ? 4 : 2;

      gl.drawElements(
        GL_TRIANGLES,
        batch.indexCount,
        indexType,
        batch.indexOffset * bytesPerIndex
      );
    }

    gl.bindVertexArray(null);
  }

  /** Clean up GPU resources. */
  destroy(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
    this.vertices.destroy();
    this.indices.destroy();
  }
}
