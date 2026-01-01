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

  // Inertial zoom animation state
  private static readonly ZOOM_DECAY = 0.00001; // Exponential decay rate (lower = faster stop)
  private static readonly ZOOM_VELOCITY_THRESHOLD = 0.0001; // Stop threshold

  private zoomVelocity = 0;
  private zoomAnchorX = 0;
  private zoomAnchorY = 0;
  private lastViewportWidth = 0;
  private lastViewportHeight = 0;

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

  /** Minimum zoom level (prevents zooming out too far) */
  static readonly MIN_ZOOM = 4;
  /** Maximum zoom level */
  static readonly MAX_ZOOM = 19;

  /** Zoom at a specific screen point */
  zoomAt(delta: number, screenX: number, screenY: number, viewportWidth: number, viewportHeight: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, this.zoom + delta));

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

  /**
   * Add velocity from scroll input for inertial zoom.
   * Velocity accumulates, allowing rapid scrolling to build up momentum.
   */
  addZoomVelocity(
    delta: number,
    screenX: number,
    screenY: number,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    // Accumulate velocity
    this.zoomVelocity += delta;

    // Update anchor point (where to zoom toward)
    this.zoomAnchorX = screenX;
    this.zoomAnchorY = screenY;
    this.lastViewportWidth = viewportWidth;
    this.lastViewportHeight = viewportHeight;
  }

  /**
   * Update zoom animation. Call this every frame with delta time.
   * Returns true if still animating (caller should request another frame).
   */
  updateZoom(dt: number): boolean {
    if (Math.abs(this.zoomVelocity) < Camera.ZOOM_VELOCITY_THRESHOLD) {
      this.zoomVelocity = 0;
      return false; // Animation complete
    }

    // Apply zoom with cursor anchoring
    // Scale by 60 to normalize for ~60fps (velocity feels consistent across frame rates)
    this.zoomAt(
      this.zoomVelocity * dt * 60,
      this.zoomAnchorX,
      this.zoomAnchorY,
      this.lastViewportWidth,
      this.lastViewportHeight
    );

    // Decay velocity (exponential decay)
    this.zoomVelocity *= Math.pow(Camera.ZOOM_DECAY, dt);

    return true; // Still animating
  }

  /** Stop any ongoing zoom animation */
  stopZoomAnimation(): void {
    this.zoomVelocity = 0;
  }

  /** Check if zoom animation is active */
  isZoomAnimating(): boolean {
    return Math.abs(this.zoomVelocity) >= Camera.ZOOM_VELOCITY_THRESHOLD;
  }
}
