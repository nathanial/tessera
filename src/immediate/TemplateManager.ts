/**
 * TemplateManager - GPU instancing for template-based rendering
 *
 * Manages pre-tessellated shape templates and batches instances
 * for efficient GPU rendering while preserving z-order.
 *
 * Uses texture-based instance data for fast batch switching.
 */

import { createProgram } from "../shaders/compile";
import {
  fillInstancedVertexShader,
  fillInstancedFragmentShader,
} from "../shaders/fillInstanced";
import type { Mat3 } from "../math/mat3";
import type { Color } from "./DrawState";

// Instance data: 2 texels per instance (8 floats)
// Texel 0: position.x, position.y, size, rotation
// Texel 1: color.r, color.g, color.b, color.a
const FLOATS_PER_INSTANCE = 8;

// Texture layout: 2D texture to avoid max texture dimension limits
// Width is fixed, height grows as needed
const TEXTURE_WIDTH = 1024; // Texels per row (512 instances per row)

// WebGL constants
const GL_FLOAT = 0x1406;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_TRIANGLES = 0x0004;
const GL_ARRAY_BUFFER = 0x8892;
const GL_ELEMENT_ARRAY_BUFFER = 0x8893;
const GL_STATIC_DRAW = 0x88e4;
const GL_RGBA32F = 0x8814;
const GL_RGBA = 0x1908;
const GL_TEXTURE_2D = 0x0de1;
const GL_TEXTURE_MIN_FILTER = 0x2801;
const GL_TEXTURE_MAG_FILTER = 0x2800;
const GL_NEAREST = 0x2600;
const GL_TEXTURE0 = 0x84c0;

interface TemplateGPU {
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
  indexType: number; // GL_UNSIGNED_SHORT or GL_UNSIGNED_INT
  vao: WebGLVertexArrayObject;
}

interface InstanceBatch {
  templateId: number;
  startIndex: number; // Start in instance data array (in instances)
  count: number; // Number of instances
}

export class TemplateManager {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;

  // Uniform locations
  private matrixLocation: WebGLUniformLocation;
  private baseInstanceLocation: WebGLUniformLocation;
  private instanceDataLocation: WebGLUniformLocation;
  private textureWidthLocation: WebGLUniformLocation;

  // Attribute location
  private localPositionLoc: number;

  // Template registry: vertex array reference -> template ID
  private templateRegistry: WeakMap<number[], number> = new WeakMap();
  private templates: TemplateGPU[] = [];

  // Per-frame instance data (stored in texture)
  private instanceData: Float32Array;
  private instanceCount: number = 0;
  private instanceCapacity: number = 1024;
  private instanceTexture: WebGLTexture;
  private textureHeight: number = 0;

  // Batch tracking for z-order preservation
  private batches: InstanceBatch[] = [];
  private currentTemplateId: number = -1;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Create shader program
    this.program = createProgram(
      gl,
      fillInstancedVertexShader,
      fillInstancedFragmentShader
    );

    // Get uniform locations
    this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix")!;
    this.baseInstanceLocation = gl.getUniformLocation(this.program, "u_baseInstance")!;
    this.instanceDataLocation = gl.getUniformLocation(this.program, "u_instanceData")!;
    this.textureWidthLocation = gl.getUniformLocation(this.program, "u_textureWidth")!;

    // Get attribute location
    this.localPositionLoc = gl.getAttribLocation(this.program, "a_localPosition");

    // Create instance data texture
    this.instanceTexture = gl.createTexture()!;
    this.instanceData = new Float32Array(this.instanceCapacity * FLOATS_PER_INSTANCE);
    this.resizeTexture();
  }

  /**
   * Register an instance to be rendered.
   * Automatically identifies template and batches consecutive same-type shapes.
   */
  registerInstance(
    vertices: number[],
    indices: number[],
    cx: number,
    cy: number,
    size: number,
    rotation: number,
    color: Color
  ): void {
    // Get or create template
    let templateId = this.templateRegistry.get(vertices);
    if (templateId === undefined) {
      templateId = this.createTemplate(vertices, indices);
      this.templateRegistry.set(vertices, templateId);
    }

    // Ensure capacity
    if (this.instanceCount >= this.instanceCapacity) {
      this.growInstanceData();
    }

    // Write instance data (8 floats per instance)
    const offset = this.instanceCount * FLOATS_PER_INSTANCE;
    this.instanceData[offset + 0] = cx;
    this.instanceData[offset + 1] = cy;
    this.instanceData[offset + 2] = size;
    this.instanceData[offset + 3] = rotation;
    this.instanceData[offset + 4] = color[0];
    this.instanceData[offset + 5] = color[1];
    this.instanceData[offset + 6] = color[2];
    this.instanceData[offset + 7] = color[3];

    // Update batches (preserve z-order by only batching consecutive same-type)
    if (templateId === this.currentTemplateId && this.batches.length > 0) {
      // Extend current batch
      this.batches[this.batches.length - 1]!.count++;
    } else {
      // Start new batch
      this.batches.push({
        templateId,
        startIndex: this.instanceCount,
        count: 1,
      });
      this.currentTemplateId = templateId;
    }

    this.instanceCount++;
  }

  /**
   * Reset for new frame. Call at start of each frame.
   */
  reset(): void {
    this.instanceCount = 0;
    this.batches = [];
    this.currentTemplateId = -1;
  }

  /**
   * Render all accumulated instances. Call during flush.
   */
  render(matrix: Mat3): void {
    if (this.batches.length === 0) return;

    const gl = this.gl;

    // Upload instance data to texture
    // 2D layout: TEXTURE_WIDTH texels wide, height as needed
    const texelCount = this.instanceCount * 2;
    const rowsNeeded = Math.ceil(texelCount / TEXTURE_WIDTH);

    gl.activeTexture(GL_TEXTURE0);
    gl.bindTexture(GL_TEXTURE_2D, this.instanceTexture);

    // Upload row by row to handle partial last row
    const floatsPerRow = TEXTURE_WIDTH * 4; // 4 floats per texel
    for (let row = 0; row < rowsNeeded; row++) {
      const texelsInRow = row === rowsNeeded - 1
        ? texelCount - row * TEXTURE_WIDTH
        : TEXTURE_WIDTH;
      const floatOffset = row * floatsPerRow;

      gl.texSubImage2D(
        GL_TEXTURE_2D,
        0,
        0, row,           // x, y offset
        texelsInRow, 1,   // width, height
        GL_RGBA,
        GL_FLOAT,
        this.instanceData.subarray(floatOffset, floatOffset + texelsInRow * 4)
      );
    }

    // Use instanced program
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.matrixLocation, false, matrix);
    gl.uniform1i(this.instanceDataLocation, 0); // Texture unit 0
    gl.uniform1i(this.textureWidthLocation, TEXTURE_WIDTH);

    // Render each batch
    for (const batch of this.batches) {
      const template = this.templates[batch.templateId]!;

      // Set base instance uniform (fast - just one uniform!)
      gl.uniform1i(this.baseInstanceLocation, batch.startIndex);

      // Bind template VAO
      gl.bindVertexArray(template.vao);

      // Draw instanced
      gl.drawElementsInstanced(
        GL_TRIANGLES,
        template.indexCount,
        template.indexType,
        0,
        batch.count
      );
    }

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindTexture(GL_TEXTURE_2D, null);
  }

  /**
   * Get rendering statistics from the last frame.
   */
  getStats(): { batches: number; instances: number; templates: number } {
    return {
      batches: this.batches.length,
      instances: this.instanceCount,
      templates: this.templates.length,
    };
  }

  /**
   * Clean up GPU resources.
   */
  destroy(): void {
    const gl = this.gl;

    gl.deleteProgram(this.program);
    gl.deleteTexture(this.instanceTexture);

    for (const template of this.templates) {
      gl.deleteBuffer(template.vertexBuffer);
      gl.deleteBuffer(template.indexBuffer);
      gl.deleteVertexArray(template.vao);
    }

    this.templates = [];
  }

  /**
   * Create GPU resources for a new template.
   */
  private createTemplate(vertices: number[], indices: number[]): number {
    const gl = this.gl;
    const templateId = this.templates.length;

    // Create vertex buffer
    const vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(GL_ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(GL_ARRAY_BUFFER, new Float32Array(vertices), GL_STATIC_DRAW);

    // Create index buffer
    const indexBuffer = gl.createBuffer()!;
    const indexType =
      vertices.length / 2 > 65535 ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
    const indexData =
      indexType === GL_UNSIGNED_INT
        ? new Uint32Array(indices)
        : new Uint16Array(indices);
    gl.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(GL_ELEMENT_ARRAY_BUFFER, indexData, GL_STATIC_DRAW);

    // Create VAO - only needs template vertex attribute (no instance attributes!)
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Setup template vertex attribute
    gl.bindBuffer(GL_ARRAY_BUFFER, vertexBuffer);
    if (this.localPositionLoc >= 0) {
      gl.enableVertexAttribArray(this.localPositionLoc);
      gl.vertexAttribPointer(this.localPositionLoc, 2, GL_FLOAT, false, 8, 0);
    }

    // Bind index buffer to VAO
    gl.bindBuffer(GL_ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.bindVertexArray(null);

    this.templates.push({
      vertexBuffer,
      indexBuffer,
      indexCount: indices.length,
      indexType,
      vao,
    });

    return templateId;
  }

  /**
   * Resize the instance data texture to fit current capacity.
   */
  private resizeTexture(): void {
    const gl = this.gl;

    // 2D texture: fixed width, variable height
    const texelCount = this.instanceCapacity * 2;
    this.textureHeight = Math.ceil(texelCount / TEXTURE_WIDTH);

    gl.bindTexture(GL_TEXTURE_2D, this.instanceTexture);
    gl.texImage2D(
      GL_TEXTURE_2D,
      0,
      GL_RGBA32F,
      TEXTURE_WIDTH,
      this.textureHeight,
      0,
      GL_RGBA,
      GL_FLOAT,
      null
    );

    // Use nearest filtering (we're fetching exact texels)
    gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    gl.bindTexture(GL_TEXTURE_2D, null);
  }

  /**
   * Double instance data capacity.
   */
  private growInstanceData(): void {
    this.instanceCapacity *= 2;
    const newData = new Float32Array(this.instanceCapacity * FLOATS_PER_INSTANCE);
    newData.set(this.instanceData);
    this.instanceData = newData;

    // Resize texture
    this.resizeTexture();
  }
}
