/**
 * Icon geometry builder for SDF rendering.
 * Builds geometry from icon instances for GPU rendering.
 */

import type { Geometry } from "../Geometry";
import { DEFAULT_ICON_STYLE, type IconAtlasMetadata, type IconStyle } from "./types";
import { appendQuad, buildQuadGeometry, type QuadCorner } from "./quad";

/** Internal representation of an icon */
export interface IconInstance {
  position: [number, number];
  iconId: string;
  style: Required<IconStyle>;
}

export class IconGeometryBuilder {
  private gl: WebGL2RenderingContext;
  private icons: IconInstance[] = [];
  private geometry: Geometry | null = null;
  private dirty = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Add an icon. Returns index. */
  add(iconId: string, x: number, y: number, style: IconStyle = {}): number {
    const mergedStyle = { ...DEFAULT_ICON_STYLE, ...style };
    this.icons.push({
      position: [x, y],
      iconId,
      style: mergedStyle,
    });
    this.dirty = true;
    return this.icons.length - 1;
  }

  /** Remove an icon by index. */
  remove(index: number): void {
    if (index >= 0 && index < this.icons.length) {
      this.icons.splice(index, 1);
      this.dirty = true;
    }
  }

  /** Clear all icons. */
  clear(): void {
    this.icons = [];
    this.geometry?.destroy();
    this.geometry = null;
    this.dirty = false;
  }

  /** Get icon count. */
  get count(): number {
    return this.icons.length;
  }

  /** Check if geometry needs rebuilding. */
  get isDirty(): boolean {
    return this.dirty;
  }

  /** Get the first icon's style (for uniform binding). */
  getFirstStyle(): Required<IconStyle> | null {
    return this.icons.length > 0 ? this.icons[0]!.style : null;
  }

  /**
   * Build geometry from icons.
   *
   * Vertex format: anchor (2) + offset (2) + texCoord (2) + color (4) = 10 floats = 40 bytes
   */
  build(metadata: IconAtlasMetadata): void {
    if (this.icons.length === 0) {
      this.geometry?.destroy();
      this.geometry = null;
      this.dirty = false;
      return;
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    for (const icon of this.icons) {
      const iconMeta = metadata.icons[icon.iconId];
      if (!iconMeta) continue;

      const anchorX = icon.position[0];
      const anchorY = icon.position[1];

      const scale = icon.style.size / Math.max(iconMeta.width, iconMeta.height);
      const halfW = (iconMeta.width * scale) / 2;
      const halfH = (iconMeta.height * scale) / 2;

      // Apply anchor offset in pixels
      const centerOffsetX = (iconMeta.anchorX - 0.5) * iconMeta.width * scale;
      const centerOffsetY = (iconMeta.anchorY - 0.5) * iconMeta.height * scale;

      // Apply rotation
      const cos = Math.cos(icon.style.rotation);
      const sin = Math.sin(icon.style.rotation);

      // UV coordinates
      const u0 = iconMeta.x / metadata.atlasWidth;
      const v0 = iconMeta.y / metadata.atlasHeight;
      const u1 = (iconMeta.x + iconMeta.width) / metadata.atlasWidth;
      const v1 = (iconMeta.y + iconMeta.height) / metadata.atlasHeight;

      // Generate corners with rotation
      const cornerData: QuadCorner[] = [
        [-halfW, -halfH, u0, v0],
        [halfW, -halfH, u1, v0],
        [-halfW, halfH, u0, v1],
        [halfW, halfH, u1, v1],
      ];

      vertexCount = appendQuad(
        vertices,
        indices,
        anchorX,
        anchorY,
        cornerData,
        icon.style.color,
        vertexCount,
        cos,
        sin,
        centerOffsetX,
        centerOffsetY
      );
    }

    this.geometry?.destroy();
    this.geometry = buildQuadGeometry(this.gl, vertices, indices, vertexCount);

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
