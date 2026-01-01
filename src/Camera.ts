/**
 * 2D Camera with pan and zoom
 */

import { type Mat3, multiply, translate, scale } from "./math/mat3";

export class Camera {
  /** Center X in world coordinates (0-1 = one tile at zoom 0) */
  centerX = 0.5;
  /** Center Y in world coordinates */
  centerY = 0.5;
  /** Zoom level (0 = world fits in view, higher = more zoomed in) */
  zoom = 0;

  /** Tile size in CSS pixels (512 for @2x retina tiles) */
  static readonly TILE_SIZE = 512;

  /** Get the view-projection matrix for rendering */
  getMatrix(viewportWidth: number, viewportHeight: number): Mat3 {
    // At zoom N, the world is TILE_SIZE * 2^N pixels wide
    // We want tiles to render at their native pixel size
    const worldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, this.zoom);

    // View size in world coordinates (0-1 range)
    // viewWidth in world = viewportWidth / worldSizeInPixels
    const viewWidth = viewportWidth / worldSizeInPixels;
    const viewHeight = viewportHeight / worldSizeInPixels;

    // Build matrix: scale * translate
    // 1. Translate so camera center is at origin
    const t = translate(-this.centerX, -this.centerY);

    // 2. Scale to clip space: view edges should map to (-1, -1) to (1, 1)
    //    with Y flipped for screen coords
    const s = scale(2 / viewWidth, -2 / viewHeight);

    // Combine: scale * translate
    return multiply(s, t);
  }

  /** Pan the camera by screen pixels */
  pan(dx: number, dy: number, viewportWidth: number, viewportHeight: number): void {
    const worldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, this.zoom);
    const viewWidth = viewportWidth / worldSizeInPixels;
    const viewHeight = viewportHeight / worldSizeInPixels;

    // Convert pixel delta to world delta
    this.centerX -= (dx / viewportWidth) * viewWidth;
    this.centerY -= (dy / viewportHeight) * viewHeight;
  }

  /** Zoom at a specific screen point */
  zoomAt(delta: number, screenX: number, screenY: number, viewportWidth: number, viewportHeight: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(0, Math.min(19, this.zoom + delta));

    if (this.zoom === oldZoom) return;

    // Screen position as fraction (0-1)
    const sx = screenX / viewportWidth;
    const sy = screenY / viewportHeight;

    // Old view dimensions in world coordinates
    const oldWorldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, oldZoom);
    const oldViewWidth = viewportWidth / oldWorldSizeInPixels;
    const oldViewHeight = viewportHeight / oldWorldSizeInPixels;

    // New view dimensions in world coordinates
    const newWorldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, this.zoom);
    const newViewWidth = viewportWidth / newWorldSizeInPixels;
    const newViewHeight = viewportHeight / newWorldSizeInPixels;

    // World position under cursor (old)
    const worldX = this.centerX + (sx - 0.5) * oldViewWidth;
    const worldY = this.centerY + (sy - 0.5) * oldViewHeight;

    // Adjust center so world position stays under cursor
    this.centerX = worldX - (sx - 0.5) * newViewWidth;
    this.centerY = worldY - (sy - 0.5) * newViewHeight;
  }

  /** Get the integer zoom level for tile fetching */
  getTileZoom(): number {
    return Math.floor(this.zoom);
  }

  /** Get the visible world bounds for culling */
  getVisibleBounds(viewportWidth: number, viewportHeight: number): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    const worldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, this.zoom);
    const viewWidth = viewportWidth / worldSizeInPixels;
    const viewHeight = viewportHeight / worldSizeInPixels;

    return {
      left: this.centerX - viewWidth / 2,
      right: this.centerX + viewWidth / 2,
      top: this.centerY - viewHeight / 2,
      bottom: this.centerY + viewHeight / 2,
    };
  }
}
