/**
 * Fill renderer - handles fill program, VAO, and batch rendering.
 */

import { createFillProgramInfo } from "../shaders/programs";
import { DynamicBuffer } from "./DynamicBuffer";
import type { Color } from "./DrawState";
import type { Mat3 } from "../math/mat3";

// WebGL constants
const GL_FLOAT = 0x1406;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_TRIANGLES = 0x0004;

export interface FillBatch {
  color: Color;
  vertexOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
}

export class FillRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  readonly vertices: DynamicBuffer;
  readonly indices: DynamicBuffer;

  private batches: FillBatch[] = [];

  // Attribute location
  private positionAttrib: number;

  // Uniform locations
  private matrixUniform: WebGLUniformLocation;
  private colorUniform: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    const programInfo = createFillProgramInfo(gl);
    this.program = programInfo.program;
    this.positionAttrib = programInfo.attribs.position;
    this.matrixUniform = programInfo.uniforms.matrix;
    this.colorUniform = programInfo.uniforms.color;

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

    if (this.positionAttrib >= 0) {
      gl.enableVertexAttribArray(this.positionAttrib);
      gl.vertexAttribPointer(this.positionAttrib, 2, GL_FLOAT, false, 8, 0);
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

  /** Add a fill batch. */
  addBatch(
    color: Color,
    vertexOffset: number,
    vertexCount: number,
    indexOffset: number,
    indexCount: number
  ): void {
    this.batches.push({
      color,
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
  render(matrix: Mat3): void {
    if (this.batches.length === 0) return;

    const gl = this.gl;

    // Upload data
    this.vertices.upload();
    this.indices.upload();

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.matrixUniform, false, matrix);

    // Bind VAO and buffers
    gl.bindVertexArray(this.vao);
    this.vertices.bind();
    this.indices.bind();

    for (const batch of this.batches) {
      gl.uniform4fv(this.colorUniform, batch.color);

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
