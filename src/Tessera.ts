/**
 * Tessera - Main renderer class
 */

import { Camera } from "./Camera";
import { Geometry } from "./Geometry";
import { TileManager } from "./TileManager";
import { DrawContext } from "./immediate/DrawContext";
import { createProgram } from "./shaders/compile";
import { tileVertexShader, tileFragmentShader, debugFragmentShader } from "./shaders/tile";

export interface TesseraOptions {
  canvas: HTMLCanvasElement;
}

export class Tessera {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera;

  private tileManager: TileManager;
  private program: WebGLProgram;
  private debugProgram: WebGLProgram;
  private quadGeometry: Geometry;

  // Uniform locations
  private uniforms: {
    matrix: WebGLUniformLocation;
    tileOffset: WebGLUniformLocation;
    tileScale: WebGLUniformLocation;
    texture: WebGLUniformLocation;
  };

  private debugUniforms: {
    matrix: WebGLUniformLocation;
    tileOffset: WebGLUniformLocation;
    tileScale: WebGLUniformLocation;
  };

  private animationId: number | null = null;
  private needsRender = true;

  constructor(options: TesseraOptions) {
    this.canvas = options.canvas;

    const gl = this.canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    this.camera = new Camera();
    this.tileManager = new TileManager(gl, () => this.requestRender());

    // Create shader programs
    this.program = createProgram(gl, tileVertexShader, tileFragmentShader);
    this.debugProgram = createProgram(gl, tileVertexShader, debugFragmentShader);

    // Get uniform locations
    this.uniforms = {
      matrix: gl.getUniformLocation(this.program, "u_matrix")!,
      tileOffset: gl.getUniformLocation(this.program, "u_tileOffset")!,
      tileScale: gl.getUniformLocation(this.program, "u_tileScale")!,
      texture: gl.getUniformLocation(this.program, "u_texture")!,
    };

    this.debugUniforms = {
      matrix: gl.getUniformLocation(this.debugProgram, "u_matrix")!,
      tileOffset: gl.getUniformLocation(this.debugProgram, "u_tileOffset")!,
      tileScale: gl.getUniformLocation(this.debugProgram, "u_tileScale")!,
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

  private frameCount = 0;
  private lastDebugTime = 0;

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

    // Debug logging (once per second)
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastDebugTime > 1000) {
      console.log(`[Tessera] frame=${this.frameCount}, tiles=${tiles.length}, zoom=${this.camera.zoom.toFixed(2)}, center=(${this.camera.centerX.toFixed(4)}, ${this.camera.centerY.toFixed(4)})`);
      if (tiles.length > 0) {
        const t = tiles[0]!;
        console.log(`[Tessera] first tile: z=${t.z}, x=${t.x}, y=${t.y}`);
      }
      this.lastDebugTime = now;
    }

    // Setup shader
    gl.useProgram(this.program);
    this.quadGeometry.bind();

    // Camera matrix
    const matrix = this.camera.getMatrix(width, height);
    gl.uniformMatrix3fv(this.uniforms.matrix, false, matrix);

    // Tile scale (world units per tile)
    const tileZoom = Math.floor(this.camera.zoom);
    const numTiles = Math.pow(2, tileZoom);
    const tileScale = 1 / numTiles;
    gl.uniform1f(this.uniforms.tileScale, tileScale);

    // Draw each tile
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.texture, 0);

    let loadedCount = 0;

    // First pass: draw debug quads for ALL tiles (so we can see geometry works)
    gl.useProgram(this.debugProgram);
    gl.uniformMatrix3fv(this.debugUniforms.matrix, false, matrix);
    gl.uniform1f(this.debugUniforms.tileScale, tileScale);

    for (const tile of tiles) {
      gl.uniform2f(this.debugUniforms.tileOffset, tile.x, tile.y);
      this.quadGeometry.draw();
    }

    // Second pass: overdraw with textured tiles where available
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uniforms.matrix, false, matrix);
    gl.uniform1f(this.uniforms.tileScale, tileScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.texture, 0);

    for (const tile of tiles) {
      const texture = this.tileManager.getTile(tile.z, tile.x, tile.y);
      if (!texture) {
        // Tile not loaded yet, request another render
        this.requestRender();
        continue;
      }

      loadedCount++;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(this.uniforms.tileOffset, tile.x, tile.y);
      this.quadGeometry.draw();
    }

    if (now - this.lastDebugTime < 100 && loadedCount > 0) {
      console.log(`[Tessera] rendered ${loadedCount}/${tiles.length} tiles`);
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
    this.gl.deleteProgram(this.debugProgram);
    this.quadGeometry.destroy();
  }

  /**
   * Create an immediate-mode drawing context.
   * Use this for Canvas 2D-like drawing API.
   */
  createDrawContext(): DrawContext {
    return new DrawContext({ gl: this.gl });
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
