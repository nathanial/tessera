/**
 * Immediate mode drawing context
 *
 * Provides a Canvas 2D-like API for drawing shapes, paths, and text.
 * All drawing commands are batched and flushed to the GPU at end().
 */

import { DrawState, type Color, type LineCap, type LineJoin } from "./DrawState";
import { PathBuilder } from "./PathBuilder";
import { TemplateManager } from "./TemplateManager";
import { FillRenderer } from "./FillRenderer";
import { StrokeRenderer } from "./StrokeRenderer";
import { fillGeoJSON, strokeGeoJSON, type PathApi } from "./GeoJSONHelpers";
import type { Mat4 } from "../math/mat4";

export interface DrawContextOptions {
  gl: WebGL2RenderingContext;
}

export class DrawContext implements PathApi {
  readonly gl: WebGL2RenderingContext;

  // State
  private state: DrawState;
  private pathBuilder: PathBuilder;

  // Renderers
  private fillRenderer: FillRenderer;
  private strokeRenderer: StrokeRenderer;
  private templateManager: TemplateManager;

  // Current matrix (set by render call)
  private matrix: Mat4 | null = null;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;

  // Clipping state
  private clipStack: Array<{ x: number; y: number; width: number; height: number }> = [];

  private inFrame: boolean = false;
  private destroyed: boolean = false;

  constructor(options: DrawContextOptions) {
    this.gl = options.gl;
    this.state = new DrawState();
    this.pathBuilder = new PathBuilder();

    // Create renderers
    this.fillRenderer = new FillRenderer(this.gl);
    this.strokeRenderer = new StrokeRenderer(this.gl);
    this.templateManager = new TemplateManager(this.gl);
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
  begin(matrix: Mat4, viewportWidth: number, viewportHeight: number): void {
    if (this.inFrame) {
      throw new Error("Already in frame - call end() first");
    }

    this.matrix = matrix;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.inFrame = true;

    // Reset renderers
    this.fillRenderer.reset();
    this.strokeRenderer.reset();
    this.templateManager.reset();

    // Reset state
    this.state.reset();
    this.pathBuilder.beginPath();

    // Reset clip stack
    this.clipStack = [];
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
    this.fillRenderer.render(this.matrix);

    // Render strokes
    this.strokeRenderer.render(this.matrix, this.viewportWidth, this.viewportHeight);

    // Render instanced templates
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

    const vertexOffset = this.fillRenderer.vertices.count / 2;
    const indexOffset = this.fillRenderer.indices.count;

    this.fillRenderer.vertices.pushArray(vertices);
    this.fillRenderer.indices.pushArrayWithOffset(indices, vertexOffset);

    this.fillRenderer.addBatch(
      this.state.getEffectiveFillColor(),
      vertexOffset,
      vertices.length / 2,
      indexOffset,
      indices.length
    );
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

    const vertexOffset = this.strokeRenderer.vertices.count / 5; // 5 floats per vertex
    const indexOffset = this.strokeRenderer.indices.count;

    this.strokeRenderer.vertices.pushArray(vertices);
    this.strokeRenderer.indices.pushArrayWithOffset(indices, vertexOffset);

    this.strokeRenderer.addBatch(
      this.state.getEffectiveStrokeColor(),
      this.state.lineWidth,
      vertexOffset,
      vertices.length / 5,
      indexOffset,
      indices.length
    );
  }

  // ==================== Primitives ====================

  /**
   * Fill a rectangle
   */
  fillRect(x: number, y: number, width: number, height: number): void {
    const vertexOffset = this.fillRenderer.vertices.count / 2;
    const indexOffset = this.fillRenderer.indices.count;

    // Vertices: bottom-left, bottom-right, top-right, top-left
    this.fillRenderer.vertices.pushArray([
      x, y,
      x + width, y,
      x + width, y + height,
      x, y + height,
    ]);

    // Two triangles
    this.fillRenderer.indices.pushArrayWithOffset([0, 1, 2, 0, 2, 3], vertexOffset);

    this.fillRenderer.addBatch(
      this.state.getEffectiveFillColor(),
      vertexOffset,
      4,
      indexOffset,
      6
    );
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
   */
  fillTemplate(
    vertices: number[],
    indices: number[],
    cx: number,
    cy: number,
    size: number,
    rotation: number
  ): void {
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
    fillGeoJSON(this, geometry);
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
    strokeGeoJSON(this, geometry);
  }

  // ==================== Clipping ====================

  /**
   * Push a clip rectangle. All subsequent drawing will be clipped to this rect.
   * Clip rects can be nested (stacked).
   */
  pushClipRect(x: number, y: number, width: number, height: number): void {
    // Flush any pending geometry before changing scissor state
    this.flush();

    // Reset renderers for new batch
    this.fillRenderer.reset();
    this.strokeRenderer.reset();
    this.templateManager.reset();

    this.clipStack.push({ x, y, width, height });
    this.applyScissor();
  }

  /**
   * Pop the current clip rectangle.
   */
  popClipRect(): void {
    // Flush any pending geometry before changing scissor state
    this.flush();

    // Reset renderers for new batch
    this.fillRenderer.reset();
    this.strokeRenderer.reset();
    this.templateManager.reset();

    this.clipStack.pop();
    this.applyScissor();
  }

  /**
   * Apply the current scissor state based on clip stack.
   */
  private applyScissor(): void {
    const gl = this.gl;

    if (this.clipStack.length === 0) {
      gl.disable(gl.SCISSOR_TEST);
    } else {
      const clip = this.clipStack[this.clipStack.length - 1]!;
      gl.enable(gl.SCISSOR_TEST);
      // Y-flip for WebGL (origin is bottom-left)
      gl.scissor(
        clip.x,
        this.viewportHeight - clip.y - clip.height,
        clip.width,
        clip.height
      );
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

    this.fillRenderer.destroy();
    this.strokeRenderer.destroy();
    this.templateManager.destroy();

    this.destroyed = true;
  }
}
