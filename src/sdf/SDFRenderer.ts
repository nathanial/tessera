/**
 * SDF Renderer
 *
 * Renders text and icons using Signed Distance Field technique
 * for crisp rendering at any scale.
 */

import { createProgram } from "../shaders/compile";
import { sdfVertexShader, sdfFragmentShader } from "./shaders";
import { createAtlasTexture, type FontAtlas, type IconAtlas } from "./AtlasManager";
import { TextGeometryBuilder } from "./TextGeometryBuilder";
import { IconGeometryBuilder } from "./IconGeometryBuilder";
import type { FontAtlasMetadata, IconAtlasMetadata, TextStyle, IconStyle } from "./types";
import type { Mat3 } from "../math/mat3";

/**
 * SDF text and icon renderer.
 *
 * Uses Signed Distance Field technique for resolution-independent
 * text and icon rendering with smooth anti-aliasing.
 */
export class SDFRenderer {
  readonly gl: WebGL2RenderingContext;

  // Shader program
  private program: WebGLProgram;
  private uniforms: {
    matrix: WebGLUniformLocation;
    viewportWidth: WebGLUniformLocation;
    viewportHeight: WebGLUniformLocation;
    atlasTexture: WebGLUniformLocation;
    color: WebGLUniformLocation;
    opacity: WebGLUniformLocation;
    sdfParams: WebGLUniformLocation;
    haloColor: WebGLUniformLocation;
  };

  // Atlases
  private fontAtlas: FontAtlas | null = null;
  private iconAtlas: IconAtlas | null = null;

  // Geometry builders
  private textBuilder: TextGeometryBuilder;
  private iconBuilder: IconGeometryBuilder;

  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Create shader program
    this.program = createProgram(gl, sdfVertexShader, sdfFragmentShader);

    // Get uniform locations
    this.uniforms = {
      matrix: gl.getUniformLocation(this.program, "u_matrix")!,
      viewportWidth: gl.getUniformLocation(this.program, "u_viewportWidth")!,
      viewportHeight: gl.getUniformLocation(this.program, "u_viewportHeight")!,
      atlasTexture: gl.getUniformLocation(this.program, "u_atlasTexture")!,
      color: gl.getUniformLocation(this.program, "u_color")!,
      opacity: gl.getUniformLocation(this.program, "u_opacity")!,
      sdfParams: gl.getUniformLocation(this.program, "u_sdfParams")!,
      haloColor: gl.getUniformLocation(this.program, "u_haloColor")!,
    };

    // Create geometry builders
    this.textBuilder = new TextGeometryBuilder(gl);
    this.iconBuilder = new IconGeometryBuilder(gl);
  }

  /**
   * Load a font atlas from metadata and image.
   */
  loadFontAtlas(metadata: FontAtlasMetadata, image: HTMLImageElement): void {
    const texture = createAtlasTexture(this.gl, image);
    this.fontAtlas = { metadata, texture };
  }

  /**
   * Load an icon atlas from metadata and image.
   */
  loadIconAtlas(metadata: IconAtlasMetadata, image: HTMLImageElement): void {
    const texture = createAtlasTexture(this.gl, image);
    this.iconAtlas = { metadata, texture };
  }

  /**
   * Add a text label.
   */
  addText(text: string, x: number, y: number, style: TextStyle = {}): number {
    return this.textBuilder.add(text, x, y, style);
  }

  /**
   * Add an icon.
   */
  addIcon(iconId: string, x: number, y: number, style: IconStyle = {}): number {
    return this.iconBuilder.add(iconId, x, y, style);
  }

  /**
   * Remove a text label by index.
   */
  removeText(index: number): void {
    this.textBuilder.remove(index);
  }

  /**
   * Remove an icon by index.
   */
  removeIcon(index: number): void {
    this.iconBuilder.remove(index);
  }

  /**
   * Clear all text labels.
   */
  clearText(): void {
    this.textBuilder.clear();
  }

  /**
   * Clear all icons.
   */
  clearIcons(): void {
    this.iconBuilder.clear();
  }

  /** Get text label count */
  get textCount(): number {
    return this.textBuilder.count;
  }

  /** Get icon count */
  get iconCount(): number {
    return this.iconBuilder.count;
  }

  /**
   * Render all text and icons.
   */
  render(matrix: Mat3, viewportWidth: number, viewportHeight: number): void {
    if (this._destroyed) return;

    // Rebuild geometry if dirty
    if (this.textBuilder.isDirty && this.fontAtlas) {
      this.textBuilder.build(this.fontAtlas.metadata);
    }
    if (this.iconBuilder.isDirty && this.iconAtlas) {
      this.iconBuilder.build(this.iconAtlas.metadata);
    }

    // Skip if nothing to render
    if (!this.textBuilder.hasGeometry() && !this.iconBuilder.hasGeometry()) return;

    const gl = this.gl;

    // Setup rendering state
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uniforms.matrix, false, matrix);
    gl.uniform1f(this.uniforms.viewportWidth, viewportWidth);
    gl.uniform1f(this.uniforms.viewportHeight, viewportHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.atlasTexture, 0);

    // Render text
    this.renderText(gl);

    // Render icons
    this.renderIcons(gl);

    gl.disable(gl.BLEND);
  }

  private renderText(gl: WebGL2RenderingContext): void {
    if (!this.textBuilder.hasGeometry() || !this.fontAtlas) return;

    gl.bindTexture(gl.TEXTURE_2D, this.fontAtlas.texture);

    const spread = this.fontAtlas.metadata.sdfSpread;
    const buffer = 0.5;
    const gamma = 1.4142 / spread;

    const style = this.textBuilder.getFirstStyle();
    if (style) {
      gl.uniform4fv(this.uniforms.color, style.color);
      gl.uniform1f(this.uniforms.opacity, style.opacity);

      const haloBuffer =
        style.haloWidth > 0 ? buffer - style.haloWidth / (2 * spread) : 0;
      gl.uniform4f(this.uniforms.sdfParams, buffer, gamma, haloBuffer, gamma);
      gl.uniform4fv(this.uniforms.haloColor, style.haloColor);

      this.textBuilder.draw();
    }
  }

  private renderIcons(gl: WebGL2RenderingContext): void {
    if (!this.iconBuilder.hasGeometry() || !this.iconAtlas) return;

    gl.bindTexture(gl.TEXTURE_2D, this.iconAtlas.texture);

    const spread = this.iconAtlas.metadata.sdfSpread;
    gl.uniform4f(this.uniforms.sdfParams, 0.5, 1.4142 / spread, 0, 0);
    gl.uniform4f(this.uniforms.haloColor, 0, 0, 0, 0);

    const style = this.iconBuilder.getFirstStyle();
    if (style) {
      gl.uniform4fv(this.uniforms.color, style.color);
      gl.uniform1f(this.uniforms.opacity, style.opacity);
    }

    this.iconBuilder.draw();
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.textBuilder.destroy();
    this.iconBuilder.destroy();

    if (this.fontAtlas) {
      this.gl.deleteTexture(this.fontAtlas.texture);
      this.fontAtlas = null;
    }

    if (this.iconAtlas) {
      this.gl.deleteTexture(this.iconAtlas.texture);
      this.iconAtlas = null;
    }

    this.gl.deleteProgram(this.program);
    this._destroyed = true;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }
}
