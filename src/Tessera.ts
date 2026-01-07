/**
 * Tessera - Main renderer class
 */

import { Camera } from "./Camera";
import { Geometry } from "./Geometry";
import { TileManager } from "./TileManager";
import { DrawContext } from "./immediate/DrawContext";
import { createProgram } from "./shaders/compile";
import { tileVertexShader, tileFragmentShader } from "./shaders/tile";

export interface TesseraOptions {
  canvas: HTMLCanvasElement;
}

export class Tessera {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;

  private tileManager: TileManager;
  private program: WebGLProgram;
  private quadGeometry: Geometry;

  // Uniform locations
  private uniforms: {
    matrix: WebGLUniformLocation;
    tileOffset: WebGLUniformLocation;
    tileScale: WebGLUniformLocation;
    texture: WebGLUniformLocation;
    uvOffset: WebGLUniformLocation;
    uvScale: WebGLUniformLocation;
  };

  private animationId: number | null = null;
  private needsRender = true;

  // Track DrawContexts for stats aggregation
  private drawContexts: DrawContext[] = [];

  constructor(options: TesseraOptions) {
    this.canvas = options.canvas;

    const gl = this.canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    this.camera = new Camera();
    this.tileManager = new TileManager(gl, () => this.requestRender());

    // Create shader program
    this.program = createProgram(gl, tileVertexShader, tileFragmentShader);

    // Get uniform locations
    this.uniforms = {
      matrix: gl.getUniformLocation(this.program, "u_matrix")!,
      tileOffset: gl.getUniformLocation(this.program, "u_tileOffset")!,
      tileScale: gl.getUniformLocation(this.program, "u_tileScale")!,
      texture: gl.getUniformLocation(this.program, "u_texture")!,
      uvOffset: gl.getUniformLocation(this.program, "u_uvOffset")!,
      uvScale: gl.getUniformLocation(this.program, "u_uvScale")!,
    };

    // Create quad geometry
    this.quadGeometry = Geometry.createQuad(gl);

    // Initial resize
    this.resize();
  }

  /** Resize the canvas to match display size */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth * dpr;
    const height = this.canvas.clientHeight * dpr;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
      this.requestRender();
    }
  }

  /** Request a render on the next frame */
  requestRender(): void {
    this.needsRender = true;
  }

  /** Render a single frame */
  render(): void {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Get visible tiles
    const tiles = this.tileManager.getVisibleTiles(
      this.camera.centerX,
      this.camera.centerY,
      this.camera.zoom,
      width,
      height
    );

    this.renderTilesInternal(this.camera, width, height, tiles);
  }

  /**
   * Render tiles for a given camera and viewport size.
   * Assumes viewport/scissor are already configured by the caller.
   */
  renderTiles(camera: Camera, viewportWidth: number, viewportHeight: number): void {
    const tiles = this.tileManager.getVisibleTiles(
      camera.centerX,
      camera.centerY,
      camera.zoom,
      viewportWidth,
      viewportHeight
    );

    this.renderTilesInternal(camera, viewportWidth, viewportHeight, tiles);
  }

  private renderTilesInternal(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
    tiles: ReturnType<TileManager["getVisibleTiles"]>
  ): void {
    const gl = this.gl;

    gl.useProgram(this.program);
    this.quadGeometry.bind();

    const matrix = camera.getMatrix(viewportWidth, viewportHeight);
    gl.uniformMatrix3fv(this.uniforms.matrix, false, matrix);

    const tileZoom = Math.floor(camera.zoom);
    const numTiles = Math.pow(2, tileZoom);
    const tileScale = 1 / numTiles;
    gl.uniform1f(this.uniforms.tileScale, tileScale);

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.texture, 0);

    for (const tile of tiles) {
      const result = this.tileManager.getTileWithFallback(tile.z, tile.x, tile.y);
      if (!result) {
        this.requestRender();
        continue;
      }

      if (!result.isExact) {
        this.requestRender();
      }

      gl.bindTexture(gl.TEXTURE_2D, result.texture);
      gl.uniform2f(this.uniforms.tileOffset, tile.worldX, tile.y);
      gl.uniform2f(this.uniforms.uvOffset, result.uvOffset[0], result.uvOffset[1]);
      gl.uniform1f(this.uniforms.uvScale, result.uvScale);
      this.quadGeometry.draw();
    }

    this.quadGeometry.unbind();
  }

  /** Start the render loop */
  start(): void {
    if (this.animationId !== null) return;

    const loop = () => {
      this.resize();
      if (this.needsRender) {
        this.needsRender = false; // Set false BEFORE render so render can re-request
        this.render();
      }
      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  /** Stop the render loop */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Clean up resources */
  destroy(): void {
    this.stop();
    this.tileManager.destroy();
    this.gl.deleteProgram(this.program);
    this.quadGeometry.destroy();
  }

  /**
   * Create an immediate-mode drawing context.
   * Use this for Canvas 2D-like drawing API.
   */
  createDrawContext(): DrawContext {
    const ctx = new DrawContext({ gl: this.gl });
    this.drawContexts.push(ctx);
    return ctx;
  }

  /**
   * Get the current view-projection matrix.
   * Useful for passing to DrawContext.begin().
   */
  getMatrix(): Float32Array {
    return this.camera.getMatrix(this.canvas.width, this.canvas.height);
  }

  /**
   * Get the current viewport dimensions (accounting for DPR).
   */
  getViewport(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
}
