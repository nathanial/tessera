/**
 * SDF Renderer
 *
 * Renders text and icons using Signed Distance Field technique
 * for crisp rendering at any scale.
 */

import { Geometry } from "../Geometry";
import { createProgram } from "../shaders/compile";
import { sdfVertexShader, sdfFragmentShader } from "./shaders";
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_ICON_STYLE,
  type FontAtlasMetadata,
  type IconAtlasMetadata,
  type TextStyle,
  type IconStyle,
} from "./types";
import type { Color } from "../FeatureRenderer";
import type { Mat3 } from "../math/mat3";

/** Internal representation of a text label */
interface TextLabel {
  position: [number, number];
  text: string;
  style: Required<TextStyle>;
}

/** Internal representation of an icon */
interface IconInstance {
  position: [number, number];
  iconId: string;
  style: Required<IconStyle>;
}

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
    atlasTexture: WebGLUniformLocation;
    color: WebGLUniformLocation;
    opacity: WebGLUniformLocation;
    sdfParams: WebGLUniformLocation;
    haloColor: WebGLUniformLocation;
  };

  // Font atlas
  private fontAtlas: {
    metadata: FontAtlasMetadata;
    texture: WebGLTexture;
  } | null = null;

  // Icon atlas
  private iconAtlas: {
    metadata: IconAtlasMetadata;
    texture: WebGLTexture;
  } | null = null;

  // Text labels
  private textLabels: TextLabel[] = [];
  private textGeometry: Geometry | null = null;
  private textDirty = false;

  // Icons
  private icons: IconInstance[] = [];
  private iconGeometry: Geometry | null = null;
  private iconDirty = false;

  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Create shader program
    this.program = createProgram(gl, sdfVertexShader, sdfFragmentShader);

    // Get uniform locations
    this.uniforms = {
      matrix: gl.getUniformLocation(this.program, "u_matrix")!,
      atlasTexture: gl.getUniformLocation(this.program, "u_atlasTexture")!,
      color: gl.getUniformLocation(this.program, "u_color")!,
      opacity: gl.getUniformLocation(this.program, "u_opacity")!,
      sdfParams: gl.getUniformLocation(this.program, "u_sdfParams")!,
      haloColor: gl.getUniformLocation(this.program, "u_haloColor")!,
    };
  }

  /**
   * Load a font atlas from metadata and image.
   *
   * @param metadata - Font atlas metadata (JSON)
   * @param image - Font atlas image (PNG)
   */
  loadFontAtlas(metadata: FontAtlasMetadata, image: HTMLImageElement): void {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create font atlas texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.fontAtlas = { metadata, texture };
    this.textDirty = true;
  }

  /**
   * Load an icon atlas from metadata and image.
   *
   * @param metadata - Icon atlas metadata (JSON)
   * @param image - Icon atlas image (PNG)
   */
  loadIconAtlas(metadata: IconAtlasMetadata, image: HTMLImageElement): void {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create icon atlas texture");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.iconAtlas = { metadata, texture };
    this.iconDirty = true;
  }

  /**
   * Add a text label.
   *
   * @param text - Text string to render
   * @param x - World X position
   * @param y - World Y position
   * @param style - Text style options
   * @returns Index of the added label
   */
  addText(text: string, x: number, y: number, style: TextStyle = {}): number {
    const mergedStyle = { ...DEFAULT_TEXT_STYLE, ...style };
    this.textLabels.push({
      position: [x, y],
      text,
      style: mergedStyle,
    });
    this.textDirty = true;
    return this.textLabels.length - 1;
  }

  /**
   * Add an icon.
   *
   * @param iconId - Icon identifier from atlas
   * @param x - World X position
   * @param y - World Y position
   * @param style - Icon style options
   * @returns Index of the added icon
   */
  addIcon(iconId: string, x: number, y: number, style: IconStyle = {}): number {
    const mergedStyle = { ...DEFAULT_ICON_STYLE, ...style };
    this.icons.push({
      position: [x, y],
      iconId,
      style: mergedStyle,
    });
    this.iconDirty = true;
    return this.icons.length - 1;
  }

  /**
   * Remove a text label by index.
   */
  removeText(index: number): void {
    if (index >= 0 && index < this.textLabels.length) {
      this.textLabels.splice(index, 1);
      this.textDirty = true;
    }
  }

  /**
   * Remove an icon by index.
   */
  removeIcon(index: number): void {
    if (index >= 0 && index < this.icons.length) {
      this.icons.splice(index, 1);
      this.iconDirty = true;
    }
  }

  /**
   * Clear all text labels.
   */
  clearText(): void {
    this.textLabels = [];
    this.textGeometry?.destroy();
    this.textGeometry = null;
    this.textDirty = false;
  }

  /**
   * Clear all icons.
   */
  clearIcons(): void {
    this.icons = [];
    this.iconGeometry?.destroy();
    this.iconGeometry = null;
    this.iconDirty = false;
  }

  /** Get text label count */
  get textCount(): number {
    return this.textLabels.length;
  }

  /** Get icon count */
  get iconCount(): number {
    return this.icons.length;
  }

  /**
   * Build text geometry from labels.
   */
  private buildTextGeometry(): void {
    if (!this.fontAtlas || this.textLabels.length === 0) {
      this.textGeometry?.destroy();
      this.textGeometry = null;
      return;
    }

    const { metadata } = this.fontAtlas;
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    for (const label of this.textLabels) {
      const scale = label.style.fontSize / metadata.size;
      let cursorX = label.position[0];
      const cursorY = label.position[1];

      // Calculate text width for alignment
      let textWidth = 0;
      for (let i = 0; i < label.text.length; i++) {
        const charCode = label.text.charCodeAt(i);
        const glyph = metadata.glyphs[charCode];
        if (glyph) {
          textWidth += glyph.xAdvance * scale;
        }
      }

      // Adjust starting position for alignment
      if (label.style.align === "center") {
        cursorX -= textWidth / 2;
      } else if (label.style.align === "right") {
        cursorX -= textWidth;
      }

      // Generate quads for each character
      for (let i = 0; i < label.text.length; i++) {
        const charCode = label.text.charCodeAt(i);
        const glyph = metadata.glyphs[charCode];
        if (!glyph) continue;

        // Quad positions
        const x0 = cursorX + glyph.xOffset * scale;
        const y0 = cursorY + glyph.yOffset * scale;
        const x1 = x0 + glyph.width * scale;
        const y1 = y0 + glyph.height * scale;

        // UV coordinates (normalized 0-1)
        const u0 = glyph.x / metadata.atlasWidth;
        const v0 = glyph.y / metadata.atlasHeight;
        const u1 = (glyph.x + glyph.width) / metadata.atlasWidth;
        const v1 = (glyph.y + glyph.height) / metadata.atlasHeight;

        // Add 4 vertices per glyph (x, y, u, v)
        vertices.push(x0, y0, u0, v0);
        vertices.push(x1, y0, u1, v0);
        vertices.push(x0, y1, u0, v1);
        vertices.push(x1, y1, u1, v1);

        // Add 2 triangles (6 indices) per glyph
        const base = vertexCount;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
        vertexCount += 4;

        // Advance cursor
        cursorX += glyph.xAdvance * scale;
      }
    }

    // Create geometry
    this.textGeometry?.destroy();
    if (vertices.length > 0) {
      this.textGeometry = new Geometry(this.gl, {
        vertices: new Float32Array(vertices),
        indices:
          vertexCount > 65535 / 4
            ? new Uint32Array(indices)
            : new Uint16Array(indices),
        attributes: [
          { location: 0, size: 2, stride: 16, offset: 0 }, // a_position
          { location: 1, size: 2, stride: 16, offset: 8 }, // a_texCoord
        ],
      });
    }

    this.textDirty = false;
  }

  /**
   * Build icon geometry.
   */
  private buildIconGeometry(): void {
    if (!this.iconAtlas || this.icons.length === 0) {
      this.iconGeometry?.destroy();
      this.iconGeometry = null;
      return;
    }

    const { metadata } = this.iconAtlas;
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    for (const icon of this.icons) {
      const iconMeta = metadata.icons[icon.iconId];
      if (!iconMeta) continue;

      const scale = icon.style.size / Math.max(iconMeta.width, iconMeta.height);
      const halfW = (iconMeta.width * scale) / 2;
      const halfH = (iconMeta.height * scale) / 2;

      // Apply anchor offset
      const offsetX = (iconMeta.anchorX - 0.5) * iconMeta.width * scale;
      const offsetY = (iconMeta.anchorY - 0.5) * iconMeta.height * scale;

      const cx = icon.position[0] + offsetX;
      const cy = icon.position[1] + offsetY;

      // Apply rotation
      const cos = Math.cos(icon.style.rotation);
      const sin = Math.sin(icon.style.rotation);

      // UV coordinates
      const u0 = iconMeta.x / metadata.atlasWidth;
      const v0 = iconMeta.y / metadata.atlasHeight;
      const u1 = (iconMeta.x + iconMeta.width) / metadata.atlasWidth;
      const v1 = (iconMeta.y + iconMeta.height) / metadata.atlasHeight;

      // Generate 4 corner vertices with rotation
      const cornerData: [number, number, number, number][] = [
        [-halfW, -halfH, u0, v0],
        [halfW, -halfH, u1, v0],
        [-halfW, halfH, u0, v1],
        [halfW, halfH, u1, v1],
      ];

      for (const [lx, ly, u, v] of cornerData) {
        const rx = cos * lx - sin * ly + cx;
        const ry = sin * lx + cos * ly + cy;
        vertices.push(rx, ry, u, v);
      }

      const base = vertexCount;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
      vertexCount += 4;
    }

    // Create geometry
    this.iconGeometry?.destroy();
    if (vertices.length > 0) {
      this.iconGeometry = new Geometry(this.gl, {
        vertices: new Float32Array(vertices),
        indices:
          vertexCount > 65535 / 4
            ? new Uint32Array(indices)
            : new Uint16Array(indices),
        attributes: [
          { location: 0, size: 2, stride: 16, offset: 0 }, // a_position
          { location: 1, size: 2, stride: 16, offset: 8 }, // a_texCoord
        ],
      });
    }

    this.iconDirty = false;
  }

  /**
   * Render all text and icons.
   *
   * @param matrix - View-projection matrix from Camera.getMatrix()
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  render(matrix: Mat3, viewportWidth: number, viewportHeight: number): void {
    if (this._destroyed) return;

    // Rebuild geometry if dirty
    if (this.textDirty) this.buildTextGeometry();
    if (this.iconDirty) this.buildIconGeometry();

    // Skip if nothing to render
    if (!this.textGeometry && !this.iconGeometry) return;

    const gl = this.gl;

    // Setup rendering state
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uniforms.matrix, false, matrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.atlasTexture, 0);

    // Render text
    if (this.textGeometry && this.fontAtlas) {
      gl.bindTexture(gl.TEXTURE_2D, this.fontAtlas.texture);

      const spread = this.fontAtlas.metadata.sdfSpread;
      const buffer = 0.5;
      const gamma = 1.4142 / spread;

      // Render each label with its style
      // Note: For full batching by style, geometry would need to be rebuilt per style group
      // This simplified version uses the first label's style for all
      if (this.textLabels.length > 0) {
        const style = this.textLabels[0]!.style;

        gl.uniform4fv(this.uniforms.color, style.color);
        gl.uniform1f(this.uniforms.opacity, style.opacity);

        const haloBuffer =
          style.haloWidth > 0 ? buffer - style.haloWidth / (2 * spread) : 0;
        gl.uniform4f(this.uniforms.sdfParams, buffer, gamma, haloBuffer, gamma);
        gl.uniform4fv(this.uniforms.haloColor, style.haloColor);

        this.textGeometry.draw();
      }
    }

    // Render icons
    if (this.iconGeometry && this.iconAtlas) {
      gl.bindTexture(gl.TEXTURE_2D, this.iconAtlas.texture);

      const spread = this.iconAtlas.metadata.sdfSpread;
      gl.uniform4f(this.uniforms.sdfParams, 0.5, 1.4142 / spread, 0, 0);
      gl.uniform4f(this.uniforms.haloColor, 0, 0, 0, 0);

      // Use first icon's style
      if (this.icons.length > 0) {
        const style = this.icons[0]!.style;
        gl.uniform4fv(this.uniforms.color, style.color);
        gl.uniform1f(this.uniforms.opacity, style.opacity);
      }

      this.iconGeometry.draw();
    }

    gl.disable(gl.BLEND);
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    if (this._destroyed) return;

    this.clearText();
    this.clearIcons();

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
