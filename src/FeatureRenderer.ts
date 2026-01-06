/**
 * GeoJSON Feature Renderer
 *
 * Renders GeoJSON geometries over the tile map with fill and stroke styling.
 * Supports z-ordering, opacity, and blend modes (Phase 3).
 */

import { Geometry } from "./Geometry";
import { createProgram } from "./shaders/compile";
import { fillVertexShader, fillFragmentShader } from "./shaders/fill";
import { strokeVertexShader, strokeFragmentShader } from "./shaders/stroke";
import { tessellateGeoJSON, extrudeGeoJSON, type CapStyle } from "./geometry/index";
import { setBlendMode, computeEffectiveColor, type BlendMode } from "./style/index";

// Re-export BlendMode for convenience
export type { BlendMode } from "./style/index";
import type { Mat4 } from "./math/mat4";

/** RGBA color as [r, g, b, a] with values 0-1 */
export type Color = [number, number, number, number];

/** Style options for a feature */
export interface FeatureStyle {
  /** Fill color for polygons (default: semi-transparent blue) */
  fillColor?: Color;
  /** Stroke color for lines and polygon outlines (default: dark blue) */
  strokeColor?: Color;
  /** Stroke width in pixels (default: 2) */
  strokeWidth?: number;
  /** Cap style for line ends (default: round) */
  strokeCap?: CapStyle;
  /** Z-index for depth ordering (default: 0, higher = on top) */
  zIndex?: number;
  /** Overall opacity multiplier 0-1 (default: 1) */
  opacity?: number;
  /** Fill-specific opacity 0-1 (default: 1) */
  fillOpacity?: number;
  /** Stroke-specific opacity 0-1 (default: 1) */
  strokeOpacity?: number;
  /** Blend mode for compositing (default: "normal") */
  blendMode?: BlendMode;
}

/** GeoJSON geometry types we support */
type SupportedGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] };

/** GeoJSON Feature type */
interface GeoJSONFeature {
  type: "Feature";
  geometry: SupportedGeometry | null;
  properties?: Record<string, unknown>;
}

/** Internal representation of a renderable feature */
interface RenderableFeature {
  fillGeometry?: Geometry;
  strokeGeometry?: Geometry;
  style: Required<FeatureStyle>;
}

/** Default style values */
const DEFAULT_STYLE: Required<FeatureStyle> = {
  fillColor: [0.2, 0.4, 0.8, 0.5],
  strokeColor: [0.1, 0.2, 0.4, 1.0],
  strokeWidth: 2,
  strokeCap: "round",
  zIndex: 0,
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  blendMode: "normal",
};

export class FeatureRenderer {
  readonly gl: WebGL2RenderingContext;

  private fillProgram: WebGLProgram;
  private strokeProgram: WebGLProgram;

  // Fill uniform locations
  private fillUniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
  };

  // Stroke uniform locations
  private strokeUniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
    halfWidth: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
  };

  private features: RenderableFeature[] = [];
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

    // Get uniform locations
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
   * Add a GeoJSON feature to be rendered.
   *
   * @param feature - GeoJSON Feature or Geometry
   * @param style - Optional styling options
   * @returns Index of the added feature (for later removal)
   */
  addFeature(
    feature: GeoJSONFeature | SupportedGeometry,
    style: FeatureStyle = {}
  ): number {
    const geometry = "geometry" in feature ? feature.geometry : feature;
    if (!geometry) return -1;

    const mergedStyle = { ...DEFAULT_STYLE, ...style };
    const renderable: RenderableFeature = { style: mergedStyle };

    // Create fill geometry for polygons
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      const tessellated = tessellateGeoJSON(geometry);

      if (tessellated.vertices.length > 0) {
        renderable.fillGeometry = new Geometry(this.gl, {
          vertices: tessellated.vertices,
          indices: tessellated.indices,
          attributes: [{ location: 0, size: 2 }], // a_position
        });
      }

      // Also create stroke geometry from the polygon outline
      const lineGeom = this.polygonToLineString(geometry);
      const extruded = extrudeGeoJSON(lineGeom, {
        cap: mergedStyle.strokeCap,
      });

      if (extruded.vertices.length > 0) {
        renderable.strokeGeometry = new Geometry(this.gl, {
          vertices: extruded.vertices,
          indices: extruded.indices,
          attributes: [
            { location: 0, size: 2, stride: 20, offset: 0 }, // a_position
            { location: 1, size: 2, stride: 20, offset: 8 }, // a_normal
            { location: 2, size: 1, stride: 20, offset: 16 }, // a_side
          ],
        });
      }
    }

    // Create stroke geometry for lines
    if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
      const extruded = extrudeGeoJSON(geometry, {
        cap: mergedStyle.strokeCap,
      });

      if (extruded.vertices.length > 0) {
        renderable.strokeGeometry = new Geometry(this.gl, {
          vertices: extruded.vertices,
          indices: extruded.indices,
          attributes: [
            { location: 0, size: 2, stride: 20, offset: 0 }, // a_position
            { location: 1, size: 2, stride: 20, offset: 8 }, // a_normal
            { location: 2, size: 1, stride: 20, offset: 16 }, // a_side
          ],
        });
      }
    }

    this.features.push(renderable);
    return this.features.length - 1;
  }

  /**
   * Convert polygon boundaries to MultiLineString for stroke rendering.
   */
  private polygonToLineString(
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] }
  ): { type: "MultiLineString"; coordinates: number[][][] } {
    const lines: number[][][] = [];

    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) {
        lines.push(ring);
      }
    } else {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          lines.push(ring);
        }
      }
    }

    return { type: "MultiLineString", coordinates: lines };
  }

  /**
   * Remove a feature by index.
   */
  removeFeature(index: number): void {
    if (index < 0 || index >= this.features.length) return;

    const feature = this.features[index];
    if (feature) {
      feature.fillGeometry?.destroy();
      feature.strokeGeometry?.destroy();
    }

    this.features.splice(index, 1);
  }

  /**
   * Clear all features.
   */
  clearFeatures(): void {
    for (const feature of this.features) {
      feature.fillGeometry?.destroy();
      feature.strokeGeometry?.destroy();
    }
    this.features = [];
  }

  /**
   * Get the number of features.
   */
  get featureCount(): number {
    return this.features.length;
  }

  /**
   * Render all features.
   *
   * Features are sorted by z-index, with fills rendered before strokes
   * at each z-level. Supports blend modes and opacity.
   *
   * @param matrix - View-projection matrix from Camera.getMatrix()
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  render(matrix: Mat4, viewportWidth: number, viewportHeight: number): void {
    if (this._destroyed || this.features.length === 0) return;

    const gl = this.gl;

    // Sort features by z-index for proper layering
    const sortedFeatures = [...this.features].sort(
      (a, b) => a.style.zIndex - b.style.zIndex
    );

    // Enable blending for transparency
    gl.enable(gl.BLEND);

    let currentBlendMode: BlendMode | null = null;
    let currentProgram: "fill" | "stroke" | null = null;

    // Render in z-order: for each feature, render fill then stroke
    for (const feature of sortedFeatures) {
      const { style } = feature;

      // Update blend mode if changed
      if (style.blendMode !== currentBlendMode) {
        currentBlendMode = style.blendMode;
        setBlendMode(gl, currentBlendMode);
      }

      // Render fill if present
      if (feature.fillGeometry) {
        if (currentProgram !== "fill") {
          gl.useProgram(this.fillProgram);
          gl.uniformMatrix4fv(this.fillUniforms.matrix, false, matrix);
          currentProgram = "fill";
        }

        const effectiveColor = computeEffectiveColor(
          style.fillColor,
          style.opacity,
          style.fillOpacity
        );
        gl.uniform4fv(this.fillUniforms.color, effectiveColor);
        feature.fillGeometry.draw();
      }

      // Render stroke if present
      if (feature.strokeGeometry) {
        if (currentProgram !== "stroke") {
          gl.useProgram(this.strokeProgram);
          gl.uniformMatrix4fv(this.strokeUniforms.matrix, false, matrix);
          gl.uniform2f(this.strokeUniforms.viewport, viewportWidth, viewportHeight);
          currentProgram = "stroke";
        }

        const effectiveColor = computeEffectiveColor(
          style.strokeColor,
          style.opacity,
          style.strokeOpacity
        );
        gl.uniform4fv(this.strokeUniforms.color, effectiveColor);
        gl.uniform1f(this.strokeUniforms.halfWidth, style.strokeWidth / 2);
        feature.strokeGeometry.draw();
      }
    }

    gl.disable(gl.BLEND);
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.clearFeatures();
    this.gl.deleteProgram(this.fillProgram);
    this.gl.deleteProgram(this.strokeProgram);

    this._destroyed = true;
  }

  /** Check if renderer has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }
}
