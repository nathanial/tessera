/**
 * Text geometry builder for SDF rendering.
 * Builds geometry from text labels for GPU rendering.
 */

import { Geometry } from "../Geometry";
import { DEFAULT_TEXT_STYLE, type FontAtlasMetadata, type TextStyle } from "./types";

/** Internal representation of a text label */
export interface TextLabel {
  position: [number, number];
  text: string;
  style: Required<TextStyle>;
}

export class TextGeometryBuilder {
  private gl: WebGL2RenderingContext;
  private labels: TextLabel[] = [];
  private geometry: Geometry | null = null;
  private dirty = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Add a text label. Returns index. */
  add(text: string, x: number, y: number, style: TextStyle = {}): number {
    const mergedStyle = { ...DEFAULT_TEXT_STYLE, ...style };
    this.labels.push({
      position: [x, y],
      text,
      style: mergedStyle,
    });
    this.dirty = true;
    return this.labels.length - 1;
  }

  /** Remove a label by index. */
  remove(index: number): void {
    if (index >= 0 && index < this.labels.length) {
      this.labels.splice(index, 1);
      this.dirty = true;
    }
  }

  /** Clear all labels. */
  clear(): void {
    this.labels = [];
    this.geometry?.destroy();
    this.geometry = null;
    this.dirty = false;
  }

  /** Get label count. */
  get count(): number {
    return this.labels.length;
  }

  /** Check if geometry needs rebuilding. */
  get isDirty(): boolean {
    return this.dirty;
  }

  /** Get the first label's style (for uniform binding). */
  getFirstStyle(): Required<TextStyle> | null {
    return this.labels.length > 0 ? this.labels[0]!.style : null;
  }

  /**
   * Build geometry from labels.
   *
   * Vertex format: anchor (2) + offset (2) + texCoord (2) = 6 floats = 24 bytes
   */
  build(metadata: FontAtlasMetadata): void {
    if (this.labels.length === 0) {
      this.geometry?.destroy();
      this.geometry = null;
      this.dirty = false;
      return;
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    for (const label of this.labels) {
      const scale = label.style.fontSize / metadata.size;
      const anchorX = label.position[0];
      const anchorY = label.position[1];
      const rotation = label.style.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      // Calculate text dimensions for alignment
      let textWidth = 0;
      let textHeight = 0;
      for (let i = 0; i < label.text.length; i++) {
        const charCode = label.text.charCodeAt(i);
        const glyph = metadata.glyphs[charCode];
        if (glyph) {
          textWidth += glyph.xAdvance * scale;
          textHeight = Math.max(textHeight, glyph.height * scale);
        }
      }

      // Calculate starting offset for alignment
      let offsetStartX = 0;
      const offsetStartY = -textHeight / 2;
      if (label.style.align === "center") {
        offsetStartX = -textWidth / 2;
      } else if (label.style.align === "right") {
        offsetStartX = -textWidth;
      }

      let pixelOffsetX = offsetStartX;

      // Generate quads for each character
      for (let i = 0; i < label.text.length; i++) {
        const charCode = label.text.charCodeAt(i);
        const glyph = metadata.glyphs[charCode];
        if (!glyph) continue;

        // Pixel offsets for quad corners
        const lx0 = pixelOffsetX + glyph.xOffset * scale;
        const ly0 = offsetStartY + glyph.yOffset * scale;
        const lx1 = lx0 + glyph.width * scale;
        const ly1 = ly0 + glyph.height * scale;

        // UV coordinates
        const u0 = glyph.x / metadata.atlasWidth;
        const v0 = glyph.y / metadata.atlasHeight;
        const u1 = (glyph.x + glyph.width) / metadata.atlasWidth;
        const v1 = (glyph.y + glyph.height) / metadata.atlasHeight;

        // Rotate each corner
        const corners: [number, number, number, number][] = [
          [lx0, ly0, u0, v0],
          [lx1, ly0, u1, v0],
          [lx0, ly1, u0, v1],
          [lx1, ly1, u1, v1],
        ];

        for (const [lx, ly, u, v] of corners) {
          const rx = cos * lx - sin * ly;
          const ry = sin * lx + cos * ly;
          vertices.push(anchorX, anchorY, rx, ry, u, v);
        }

        const base = vertexCount;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
        vertexCount += 4;

        pixelOffsetX += glyph.xAdvance * scale;
      }
    }

    this.geometry?.destroy();
    if (vertices.length > 0) {
      this.geometry = new Geometry(this.gl, {
        vertices: new Float32Array(vertices),
        indices:
          vertexCount > 65535 / 4
            ? new Uint32Array(indices)
            : new Uint16Array(indices),
        attributes: [
          { location: 0, size: 2, stride: 24, offset: 0 },
          { location: 1, size: 2, stride: 24, offset: 8 },
          { location: 2, size: 2, stride: 24, offset: 16 },
        ],
      });
    }

    this.dirty = false;
  }

  /** Draw the geometry. */
  draw(): void {
    this.geometry?.draw();
  }

  /** Check if geometry exists. */
  hasGeometry(): boolean {
    return this.geometry !== null;
  }

  /** Clean up resources. */
  destroy(): void {
    this.clear();
  }
}
