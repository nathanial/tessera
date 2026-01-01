/**
 * Immediate mode drawing context
 *
 * Provides a Canvas 2D-like API for drawing shapes, paths, and text.
 * All drawing commands are batched and flushed to the GPU at end().
 */

import { DrawState, type Color, type LineCap, type LineJoin } from "./DrawState";
import { DynamicBuffer } from "./DynamicBuffer";
import { PathBuilder } from "./PathBuilder";
import { TemplateManager } from "./TemplateManager";
import { createProgram } from "../shaders/compile";
import { fillVertexShader, fillFragmentShader } from "../shaders/fill";
import { strokeVertexShader, strokeFragmentShader } from "../shaders/stroke";
import type { Mat3 } from "../math/mat3";


// WebGL constants
const GL_FLOAT = 0x1406;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;
const GL_TRIANGLES = 0x0004;

interface BatchEntry {
  type: "fill" | "stroke";
  color: Color;
  lineWidth?: number;
  vertexOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
}

export interface DrawContextOptions {
  gl: WebGL2RenderingContext;
}

export class DrawContext {
  readonly gl: WebGL2RenderingContext;

  // State
  private state: DrawState;
  private pathBuilder: PathBuilder;

  // GPU resources
  private fillProgram: WebGLProgram;
  private strokeProgram: WebGLProgram;

  private fillVao: WebGLVertexArrayObject;
  private strokeVao: WebGLVertexArrayObject;

  private fillVertices: DynamicBuffer;
  private fillIndices: DynamicBuffer;
  private strokeVertices: DynamicBuffer;
  private strokeIndices: DynamicBuffer;

  // Instanced template rendering
  private templateManager: TemplateManager;

  // Attribute locations
  private fillAttribs: {
    position: number;
  };
  private strokeAttribs: {
    position: number;
    normal: number;
    side: number;
  };

  // Uniform locations
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

  // Batch tracking
  private fillBatches: BatchEntry[] = [];
  private strokeBatches: BatchEntry[] = [];

  // Current matrix (set by render call)
  private matrix: Mat3 | null = null;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;

  private inFrame: boolean = false;
  private destroyed: boolean = false;

  constructor(options: DrawContextOptions) {
    this.gl = options.gl;
    this.state = new DrawState();
    this.pathBuilder = new PathBuilder();

    // Create shader programs
    this.fillProgram = createProgram(
      this.gl,
      fillVertexShader,
      fillFragmentShader
    );
    this.strokeProgram = createProgram(
      this.gl,
      strokeVertexShader,
      strokeFragmentShader
    );

    // Get attribute locations
    this.fillAttribs = {
      position: this.gl.getAttribLocation(this.fillProgram, "a_position"),
    };
    this.strokeAttribs = {
      position: this.gl.getAttribLocation(this.strokeProgram, "a_position"),
      normal: this.gl.getAttribLocation(this.strokeProgram, "a_normal"),
      side: this.gl.getAttribLocation(this.strokeProgram, "a_side"),
    };

    // Get uniform locations
    this.fillUniforms = {
      matrix: this.gl.getUniformLocation(this.fillProgram, "u_matrix")!,
      color: this.gl.getUniformLocation(this.fillProgram, "u_color")!,
    };
    this.strokeUniforms = {
      matrix: this.gl.getUniformLocation(this.strokeProgram, "u_matrix")!,
      color: this.gl.getUniformLocation(this.strokeProgram, "u_color")!,
      halfWidth: this.gl.getUniformLocation(this.strokeProgram, "u_halfWidth")!,
      viewport: this.gl.getUniformLocation(this.strokeProgram, "u_viewport")!,
    };

    // Create dynamic buffers
    this.fillVertices = new DynamicBuffer(this.gl, "vertex", 4096);
    this.fillIndices = new DynamicBuffer(this.gl, "index", 2048);
    this.strokeVertices = new DynamicBuffer(this.gl, "vertex", 4096);
    this.strokeIndices = new DynamicBuffer(this.gl, "index", 2048);

    // Create VAOs
    this.fillVao = this.createFillVao();
    this.strokeVao = this.createStrokeVao();

    // Create template manager for instanced rendering
    this.templateManager = new TemplateManager(this.gl);
  }

  private createFillVao(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    this.fillVertices.bind();

    const posLoc = this.fillAttribs.position;
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, GL_FLOAT, false, 8, 0);
    }

    this.fillIndices.bind();

    gl.bindVertexArray(null);
    return vao;
  }

  private createStrokeVao(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    this.strokeVertices.bind();

    // Stride: 5 floats = 20 bytes (x, y, nx, ny, side)
    const stride = 20;

    const posLoc = this.strokeAttribs.position;
    const normLoc = this.strokeAttribs.normal;
    const sideLoc = this.strokeAttribs.side;

    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, GL_FLOAT, false, stride, 0);
    }

    if (normLoc >= 0) {
      gl.enableVertexAttribArray(normLoc);
      gl.vertexAttribPointer(normLoc, 2, GL_FLOAT, false, stride, 8);
    }

    if (sideLoc >= 0) {
      gl.enableVertexAttribArray(sideLoc);
      gl.vertexAttribPointer(sideLoc, 1, GL_FLOAT, false, stride, 16);
    }

    this.strokeIndices.bind();

    gl.bindVertexArray(null);
    return vao;
  }

  // ==================== State Properties ====================

  get fillStyle(): Color {
    return this.state.fillStyle;
  }

  set fillStyle(color: Color) {
    this.state.fillStyle = color;
  }

  get strokeStyle(): Color {
    return this.state.strokeStyle;
  }

  set strokeStyle(color: Color) {
    this.state.strokeStyle = color;
  }

  get lineWidth(): number {
    return this.state.lineWidth;
  }

  set lineWidth(width: number) {
    this.state.lineWidth = width;
  }

  get lineCap(): LineCap {
    return this.state.lineCap;
  }

  set lineCap(cap: LineCap) {
    this.state.lineCap = cap;
  }

  get lineJoin(): LineJoin {
    return this.state.lineJoin;
  }

  set lineJoin(join: LineJoin) {
    this.state.lineJoin = join;
  }

  get miterLimit(): number {
    return this.state.miterLimit;
  }

  set miterLimit(limit: number) {
    this.state.miterLimit = limit;
  }

  get globalAlpha(): number {
    return this.state.globalAlpha;
  }

  set globalAlpha(alpha: number) {
    this.state.globalAlpha = alpha;
  }

  // ==================== State Stack ====================

  save(): void {
    this.state.save();
  }

  restore(): void {
    this.state.restore();
  }

  // ==================== Frame Control ====================

  /**
   * Begin a new frame. Must be called before any drawing commands.
   */
  begin(matrix: Mat3, viewportWidth: number, viewportHeight: number): void {
    if (this.inFrame) {
      throw new Error("Already in frame - call end() first");
    }

    this.matrix = matrix;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.inFrame = true;

    // Reset buffers
    this.fillVertices.reset();
    this.fillIndices.reset();
    this.strokeVertices.reset();
    this.strokeIndices.reset();

    // Clear batches
    this.fillBatches = [];
    this.strokeBatches = [];

    // Reset instanced template manager
    this.templateManager.reset();

    // Reset state
    this.state.reset();
    this.pathBuilder.beginPath();
  }

  /**
   * End the frame and flush all batched commands to the GPU.
   */
  end(): void {
    if (!this.inFrame) {
      throw new Error("Not in frame - call begin() first");
    }

    this.flush();
    this.inFrame = false;
    this.matrix = null;
  }

  /**
   * Flush accumulated geometry to the GPU and render
   */
  private flush(): void {
    const gl = this.gl;

    if (!this.matrix) return;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render fills
    if (this.fillBatches.length > 0) {
      // Upload fill data
      this.fillVertices.upload();
      this.fillIndices.upload();

      gl.useProgram(this.fillProgram);
      gl.uniformMatrix3fv(this.fillUniforms.matrix, false, this.matrix);

      // Bind VAO and re-bindthe buffers to ensure they're connected
      gl.bindVertexArray(this.fillVao);
      this.fillVertices.bind();
      this.fillIndices.bind();

      for (const batch of this.fillBatches) {
        gl.uniform4fv(this.fillUniforms.color, batch.color);

        const indexType = this.fillIndices.isUint32
          ? GL_UNSIGNED_INT
          : GL_UNSIGNED_SHORT;
        const bytesPerIndex = this.fillIndices.isUint32 ? 4 : 2;

        gl.drawElements(
          GL_TRIANGLES,
          batch.indexCount,
          indexType,
          batch.indexOffset * bytesPerIndex
        );
      }

      gl.bindVertexArray(null);
    }

    // Render strokes
    if (this.strokeBatches.length > 0) {
      // Upload stroke data
      this.strokeVertices.upload();
      this.strokeIndices.upload();

      gl.useProgram(this.strokeProgram);
      gl.uniformMatrix3fv(this.strokeUniforms.matrix, false, this.matrix);
      gl.uniform2f(
        this.strokeUniforms.viewport,
        this.viewportWidth,
        this.viewportHeight
      );

      // Bind VAO and re-bind the buffers
      gl.bindVertexArray(this.strokeVao);
      this.strokeVertices.bind();
      this.strokeIndices.bind();

      for (const batch of this.strokeBatches) {
        gl.uniform4fv(this.strokeUniforms.color, batch.color);
        gl.uniform1f(this.strokeUniforms.halfWidth, (batch.lineWidth ?? 1) / 2);

        const indexType = this.strokeIndices.isUint32
          ? GL_UNSIGNED_INT
          : GL_UNSIGNED_SHORT;
        const bytesPerIndex = this.strokeIndices.isUint32 ? 4 : 2;

        gl.drawElements(
          GL_TRIANGLES,
          batch.indexCount,
          indexType,
          batch.indexOffset * bytesPerIndex
        );
      }

      gl.bindVertexArray(null);
    }

    // Render instanced templates (fillTemplate calls)
    // Note: Templates are rendered after regular fills/strokes.
    // For mixed rendering with strict z-order, call end() to flush between.
    this.templateManager.render(this.matrix);

    // Clean up GL state
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.useProgram(null);
  }

  // ==================== Path API ====================

  beginPath(): void {
    this.pathBuilder.beginPath();
  }

  moveTo(x: number, y: number): void {
    this.pathBuilder.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.pathBuilder.lineTo(x, y);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void {
    this.pathBuilder.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }

  closePath(): void {
    this.pathBuilder.closePath();
  }

  /**
   * Fill the current path
   */
  fill(): void {
    if (this.pathBuilder.isEmpty()) return;

    const { vertices, indices } = this.pathBuilder.tessellate();
    if (indices.length === 0) return;

    const vertexOffset = this.fillVertices.count / 2;
    const indexOffset = this.fillIndices.count;

    this.fillVertices.pushArray(vertices);
    this.fillIndices.pushArrayWithOffset(indices, vertexOffset);

    this.fillBatches.push({
      type: "fill",
      color: this.state.getEffectiveFillColor(),
      vertexOffset,
      vertexCount: vertices.length / 2,
      indexOffset,
      indexCount: indices.length,
    });
  }

  /**
   * Stroke the current path
   */
  stroke(): void {
    if (this.pathBuilder.isEmpty()) return;

    const { vertices, indices } = this.pathBuilder.extrude(
      this.state.lineCap,
      this.state.miterLimit
    );
    if (indices.length === 0) return;

    const vertexOffset = this.strokeVertices.count / 5; // 5 floats per vertex
    const indexOffset = this.strokeIndices.count;

    this.strokeVertices.pushArray(vertices);
    this.strokeIndices.pushArrayWithOffset(indices, vertexOffset);

    this.strokeBatches.push({
      type: "stroke",
      color: this.state.getEffectiveStrokeColor(),
      lineWidth: this.state.lineWidth,
      vertexOffset,
      vertexCount: vertices.length / 5,
      indexOffset,
      indexCount: indices.length,
    });
  }

  // ==================== Primitives ====================

  /**
   * Fill a rectangle
   */
  fillRect(x: number, y: number, width: number, height: number): void {
    // Simple rectangle - 4 vertices, 2 triangles
    const vertexOffset = this.fillVertices.count / 2;
    const indexOffset = this.fillIndices.count;

    // Vertices: bottom-left, bottom-right, top-right, top-left
    this.fillVertices.pushArray([
      x, y,
      x + width, y,
      x + width, y + height,
      x, y + height,
    ]);

    // Two triangles
    this.fillIndices.pushArrayWithOffset([0, 1, 2, 0, 2, 3], vertexOffset);

    this.fillBatches.push({
      type: "fill",
      color: this.state.getEffectiveFillColor(),
      vertexOffset,
      vertexCount: 4,
      indexOffset,
      indexCount: 6,
    });
  }

  /**
   * Stroke a rectangle
   */
  strokeRect(x: number, y: number, width: number, height: number): void {
    this.beginPath();
    this.pathBuilder.rect(x, y, width, height);
    this.stroke();
  }

  /**
   * Fill a circle
   */
  fillCircle(cx: number, cy: number, radius: number): void {
    this.beginPath();
    this.arc(cx, cy, radius, 0, Math.PI * 2);
    this.closePath();
    this.fill();
  }

  /**
   * Stroke a circle
   */
  strokeCircle(cx: number, cy: number, radius: number): void {
    this.beginPath();
    this.arc(cx, cy, radius, 0, Math.PI * 2);
    this.closePath();
    this.stroke();
  }

  // ==================== Template Rendering ====================

  /**
   * Fill a pre-tessellated shape template with transformation.
   * Uses GPU instancing for efficient rendering of many shapes.
   *
   * @param vertices - Unit vertices [x0, y0, x1, y1, ...] (radius 1, centered at origin)
   * @param indices - Triangle indices
   * @param cx - Center X position
   * @param cy - Center Y position
   * @param size - Scale factor (radius)
   * @param rotation - Rotation in radians
   */
  fillTemplate(
    vertices: number[],
    indices: number[],
    cx: number,
    cy: number,
    size: number,
    rotation: number
  ): void {
    // Delegate to template manager for GPU instancing
    this.templateManager.registerInstance(
      vertices,
      indices,
      cx,
      cy,
      size,
      rotation,
      this.state.getEffectiveFillColor()
    );
  }

  // ==================== GeoJSON Helpers ====================

  /**
   * Fill a GeoJSON Polygon or MultiPolygon
   */
  fillGeoJSON(
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] }
  ): void {
    this.beginPath();

    if (geometry.type === "Polygon") {
      this.tracePolygon(geometry.coordinates);
    } else {
      for (const polygon of geometry.coordinates) {
        this.tracePolygon(polygon);
      }
    }

    this.fill();
  }

  /**
   * Stroke a GeoJSON LineString, MultiLineString, Polygon, or MultiPolygon
   */
  strokeGeoJSON(
    geometry:
      | { type: "LineString"; coordinates: number[][] }
      | { type: "MultiLineString"; coordinates: number[][][] }
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] }
  ): void {
    this.beginPath();

    if (geometry.type === "LineString") {
      this.traceLine(geometry.coordinates);
    } else if (geometry.type === "MultiLineString") {
      for (const line of geometry.coordinates) {
        this.traceLine(line);
      }
    } else if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) {
        this.traceLine(ring);
        this.closePath();
      }
    } else {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          this.traceLine(ring);
          this.closePath();
        }
      }
    }

    this.stroke();
  }

  private tracePolygon(rings: number[][][]): void {
    for (const ring of rings) {
      this.traceLine(ring);
      this.closePath();
    }
  }

  private traceLine(coords: number[][]): void {
    if (coords.length === 0) return;
    const [x, y] = coords[0]!;
    this.moveTo(x!, y!);
    for (let i = 1; i < coords.length; i++) {
      const [px, py] = coords[i]!;
      this.lineTo(px!, py!);
    }
  }

  // ==================== Stats ====================

  /**
   * Get rendering statistics from the last frame.
   */
  getStats(): { batches: number; instances: number; templates: number } {
    return this.templateManager.getStats();
  }

  // ==================== Cleanup ====================

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    if (this.destroyed) return;

    this.gl.deleteProgram(this.fillProgram);
    this.gl.deleteProgram(this.strokeProgram);
    this.gl.deleteVertexArray(this.fillVao);
    this.gl.deleteVertexArray(this.strokeVao);

    this.fillVertices.destroy();
    this.fillIndices.destroy();
    this.strokeVertices.destroy();
    this.strokeIndices.destroy();

    this.templateManager.destroy();

    this.destroyed = true;
  }
}
