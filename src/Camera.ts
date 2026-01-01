/**
 * 2D Camera with pan and zoom
 */

import { type Mat3, multiply, translate, scale, create } from "./math/mat3";
import type { TileKey } from "./projection/types";

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

  /**
   * Get matrix for rendering tile-relative geometry.
   *
   * This matrix transforms coordinates in tile-local space (0-1 per tile)
   * directly to clip space, accounting for:
   * 1. Tile scale (tile size in world coordinates)
   * 2. Tile position in world
   * 3. Camera position and zoom
   * 4. Viewport dimensions
   *
   * This preserves precision at high zoom levels by keeping coordinates
   * small (0-1 per tile) rather than using global world coordinates.
   *
   * @param tile - The tile these coordinates are relative to
   * @param viewportWidth - Viewport width in pixels
   * @param viewportHeight - Viewport height in pixels
   */
  getTileRelativeMatrix(
    tile: TileKey,
    viewportWidth: number,
    viewportHeight: number
  ): Mat3 {
    const numTiles = 1 << tile.z; // 2^zoom
    const tileWorldSize = 1 / numTiles;

    // Tile origin in world coordinates
    const tileOriginX = tile.x * tileWorldSize;
    const tileOriginY = tile.y * tileWorldSize;

    // World size in pixels at current camera zoom
    const worldSizeInPixels = Camera.TILE_SIZE * Math.pow(2, this.zoom);

    // View dimensions in world coordinates
    const viewWidth = viewportWidth / worldSizeInPixels;
    const viewHeight = viewportHeight / worldSizeInPixels;

    // Combined transform: tile-local (0-1) -> clip space (-1 to 1)
    //
    // For a point (localX, localY) in tile space:
    //   worldX = tileOriginX + localX * tileWorldSize
    //   worldY = tileOriginY + localY * tileWorldSize
    //
    // Then camera transform:
    //   clipX = (worldX - centerX) * (2 / viewWidth)
    //   clipY = (worldY - centerY) * (-2 / viewHeight)
    //
    // Combining:
    //   clipX = localX * (tileWorldSize * 2 / viewWidth)
    //         + (tileOriginX - centerX) * (2 / viewWidth)

    const scaleX = (tileWorldSize * 2) / viewWidth;
    const scaleY = (-tileWorldSize * 2) / viewHeight;
    const translateX = ((tileOriginX - this.centerX) * 2) / viewWidth;
    const translateY = (-(tileOriginY - this.centerY) * 2) / viewHeight;

    // Build the matrix directly (row-major, column vectors)
    // [ scaleX,      0,        0 ]
    // [ 0,           scaleY,   0 ]
    // [ translateX,  translateY, 1 ]
    const m = create();
    m[0] = scaleX;
    m[4] = scaleY;
    m[6] = translateX;
    m[7] = translateY;
    return m;
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
}
