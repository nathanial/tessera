/**
 * Tessera - Main renderer class with 3D terrain support
 */

import { Camera3D } from "./Camera3D";
import { Camera } from "./Camera";
import { Geometry } from "./Geometry";
import { TileManager } from "./TileManager";
import { DrawContext } from "./immediate/DrawContext";
import { createProgram } from "./shaders/compile";
import { terrainVertexShader, terrainFragmentShader } from "./shaders/terrain";
import { TerrainTileManager, type TerrainMeshData } from "./terrain/TerrainTileManager";
import { TerrainMeshCache } from "./terrain/TerrainMesh";
import { HeightSampler } from "./terrain/HeightSampler";
import type { TileCoord } from "./terrain/TerrainTileLoader";
import type { Mat4 } from "./math/mat4";

export interface TesseraOptions {
  canvas: HTMLCanvasElement;
  /** Cesium Ion access token for terrain data */
  cesiumAccessToken?: string;
}

export class Tessera {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera3D;

  private tileManager: TileManager;
  private terrainManager: TerrainTileManager | null = null;
  private terrainMeshCache: TerrainMeshCache;
  private heightSampler: HeightSampler | null = null;

  private terrainProgram: WebGLProgram;

  // Terrain shader uniform locations
  private terrainUniforms: {
    viewProjection: WebGLUniformLocation;
    texture: WebGLUniformLocation;
    uvOffset: WebGLUniformLocation;
    uvScale: WebGLUniformLocation;
    minHeight: WebGLUniformLocation;
    maxHeight: WebGLUniformLocation;
  };

  private animationId: number | null = null;
  private needsRender = true;

  // Track DrawContexts for stats aggregation
  private drawContexts: DrawContext[] = [];

  constructor(options: TesseraOptions) {
    this.canvas = options.canvas;

    // Request WebGL2 context with depth buffer
    const gl = this.canvas.getContext("webgl2", {
      depth: true,
      antialias: true,
    });
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    // Use 3D camera
    this.camera = new Camera3D();
    this.tileManager = new TileManager(gl, () => this.requestRender());

    // Initialize terrain if access token provided
    if (options.cesiumAccessToken) {
      this.terrainManager = new TerrainTileManager(
        options.cesiumAccessToken,
        1, // default asset ID
        () => this.requestRender() // callback when tiles load
      );
      this.heightSampler = new HeightSampler(this.terrainManager);
      // Initialize terrain manager
      this.terrainManager.initialize().catch((err) => {
        console.error("Failed to initialize terrain:", err);
      });
    }

    this.terrainMeshCache = new TerrainMeshCache(gl);

    // Create terrain shader program
    this.terrainProgram = createProgram(gl, terrainVertexShader, terrainFragmentShader);

    // Get terrain shader uniform locations
    this.terrainUniforms = {
      viewProjection: gl.getUniformLocation(this.terrainProgram, "u_viewProjection")!,
      texture: gl.getUniformLocation(this.terrainProgram, "u_texture")!,
      uvOffset: gl.getUniformLocation(this.terrainProgram, "u_uvOffset")!,
      uvScale: gl.getUniformLocation(this.terrainProgram, "u_uvScale")!,
      minHeight: gl.getUniformLocation(this.terrainProgram, "u_minHeight")!,
      maxHeight: gl.getUniformLocation(this.terrainProgram, "u_maxHeight")!,
    };

    // Initial resize
    this.resize();
  }

  /** Get the height sampler for draping features onto terrain */
  getHeightSampler(): HeightSampler | null {
    return this.heightSampler;
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

    // Update camera matrices
    const aspectRatio = width / height;
    this.camera.updateMatrices(aspectRatio);

    // Clear with depth
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Render terrain
    this.renderTerrain();

    // Debug logging (once per second)
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastDebugTime > 1000) {
      // Aggregate stats from all draw contexts
      let totalBatches = 0;
      let totalInstances = 0;
      for (const ctx of this.drawContexts) {
        const stats = ctx.getStats();
        totalBatches += stats.batches;
        totalInstances += stats.instances;
      }
      console.log(
        `[Tessera] frame=${this.frameCount}, batches=${totalBatches}, instances=${totalInstances}, ` +
        `zoom=${this.camera.zoom.toFixed(2)}, pitch=${this.camera.pitch.toFixed(1)}, yaw=${this.camera.yaw.toFixed(1)}`
      );
      this.lastDebugTime = now;
    }
  }

  /** Render terrain meshes */
  private renderTerrain(): void {
    if (!this.terrainManager) return;

    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Get visible terrain tiles
    const bounds = this.camera.getVisibleBounds(width, height);
    const visibleTiles = this.terrainManager.getVisibleTiles(bounds, this.camera.zoom);

    // Setup terrain shader
    gl.useProgram(this.terrainProgram);
    gl.uniformMatrix4fv(this.terrainUniforms.viewProjection, false, this.camera.getViewProjectionMatrix());

    // Texture unit
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.terrainUniforms.texture, 0);

    // Load and render each terrain tile
    for (const coord of visibleTiles) {
      // Try to get terrain mesh
      const meshData = this.terrainManager.getCachedTile(coord);
      if (meshData) {
        this.renderTerrainTile(meshData, coord);
      } else {
        // Request terrain tile to load (non-blocking, queued)
        this.terrainManager.requestTile(coord);
      }
    }
  }

  /** Render a single terrain tile */
  private renderTerrainTile(meshData: TerrainMeshData, coord: TileCoord): void {
    const gl = this.gl;

    // Get or create GPU mesh
    const mesh = this.terrainMeshCache.getOrCreate(meshData);

    // Get raster tile texture for this terrain tile
    // Map terrain tile to raster tile (they may be at different zoom levels)
    const rasterResult = this.tileManager.getTileWithFallback(coord.z, coord.x, coord.y);

    if (rasterResult) {
      gl.bindTexture(gl.TEXTURE_2D, rasterResult.texture);
      gl.uniform2f(this.terrainUniforms.uvOffset, rasterResult.uvOffset[0], rasterResult.uvOffset[1]);
      gl.uniform1f(this.terrainUniforms.uvScale, rasterResult.uvScale);
    } else {
      // No texture available, request render when it loads
      this.requestRender();
      // Use default gray color by setting invalid UV
      gl.uniform2f(this.terrainUniforms.uvOffset, 0, 0);
      gl.uniform1f(this.terrainUniforms.uvScale, 1);
    }

    // Set height range for shading
    gl.uniform1f(this.terrainUniforms.minHeight, meshData.minHeight);
    gl.uniform1f(this.terrainUniforms.maxHeight, meshData.maxHeight);

    // Draw terrain mesh
    mesh.draw();
  }

  /**
   * Render tiles for a given camera and viewport size.
   * This method renders the terrain with raster tile textures.
   * For use with multiple viewports/panes.
   * Accepts both Camera (2D) and Camera3D for backward compatibility.
   */
  renderTiles(camera: Camera | Camera3D, viewportWidth: number, viewportHeight: number): void {
    const gl = this.gl;

    // Check if this is a 3D camera or 2D camera
    const is3D = camera instanceof Camera3D;

    if (is3D) {
      // 3D terrain rendering
      const cam3d = camera as Camera3D;
      const aspectRatio = viewportWidth / viewportHeight;
      cam3d.updateMatrices(aspectRatio);

      if (!this.terrainManager) {
        return;
      }

      const bounds = cam3d.getVisibleBounds(viewportWidth, viewportHeight);
      const visibleTiles = this.terrainManager.getVisibleTiles(bounds, cam3d.zoom);

      gl.useProgram(this.terrainProgram);
      gl.uniformMatrix4fv(this.terrainUniforms.viewProjection, false, cam3d.getViewProjectionMatrix());

      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.terrainUniforms.texture, 0);

      for (const coord of visibleTiles) {
        const meshData = this.terrainManager.getCachedTile(coord);
        if (meshData) {
          this.renderTerrainTile(meshData, coord);
        } else {
          // Request terrain tile to load (non-blocking, queued)
          this.terrainManager.requestTile(coord);
        }
      }
    } else {
      // 2D tile rendering (legacy fallback)
      // Note: 2D Camera doesn't support terrain - renders nothing
      // Migrate to Camera3D for terrain support
    }
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
    this.terrainMeshCache.destroy();
    this.gl.deleteProgram(this.terrainProgram);
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
   * Get the current view-projection matrix (4x4 for 3D).
   * Useful for passing to DrawContext.begin().
   */
  getMatrix(): Mat4 {
    return this.camera.getViewProjectionMatrix();
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
