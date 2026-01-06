/**
 * 3D Camera with orbit, pan, and zoom controls for terrain viewing
 */

import { type Vec3, normalize, subtract, add, scale as scaleVec } from "./math/vec3";
import { type Mat4, perspective, lookAt, multiply, invert, create as createMat4 } from "./math/mat4";

export class Camera3D {
  /** Camera position in world coordinates (x, y, altitude) */
  position: Vec3 = [0.5, 0.5, 0.1];

  /** Target point the camera looks at */
  target: Vec3 = [0.5, 0.5, 0];

  /** Center X in world coordinates (alias for target[0], for 2D Camera compatibility) */
  get centerX(): number {
    return this.target[0];
  }
  set centerX(value: number) {
    this.target[0] = value;
    this.dirty = true;
    this.updatePositionFromOrbit();
  }

  /** Center Y in world coordinates (alias for target[1], for 2D Camera compatibility) */
  get centerY(): number {
    return this.target[1];
  }
  set centerY(value: number) {
    this.target[1] = value;
    this.dirty = true;
    this.updatePositionFromOrbit();
  }

  /** Pitch angle in degrees (-89 to 89, negative = looking down) */
  pitch = -45;

  /** Yaw angle in degrees (0 = north, clockwise) */
  yaw = 0;

  /** Distance from target to camera */
  distance = 0.1;

  /** Field of view in degrees */
  fov = 60;

  /** Near clipping plane */
  near = 0.00001;

  /** Far clipping plane */
  far = 10;

  /** Tile size in CSS pixels (same as 2D camera) */
  static readonly TILE_SIZE = 512;

  /** Zoom level limits */
  static readonly MIN_ZOOM = 4;
  static readonly MAX_ZOOM = 19;

  /** Pitch limits */
  static readonly MIN_PITCH = -89;
  static readonly MAX_PITCH = 10;

  /** Current logical zoom level (for tile loading) */
  zoom = 6;

  // Cached matrices
  private viewMatrix: Mat4 = createMat4();
  private projectionMatrix: Mat4 = createMat4();
  private viewProjectionMatrix: Mat4 = createMat4();
  private inverseViewProjectionMatrix: Mat4 | null = null;
  private dirty = true;

  // Inertial zoom state
  private static readonly ZOOM_DECAY = 0.0000000001;
  private static readonly ZOOM_VELOCITY_THRESHOLD = 0.0001;

  private zoomVelocity = 0;
  private zoomAnchorX = 0;
  private zoomAnchorY = 0;
  private lastViewportWidth = 0;
  private lastViewportHeight = 0;

  constructor() {
    this.updatePositionFromOrbit();
  }

  /** Update camera position based on orbit parameters */
  private updatePositionFromOrbit(): void {
    const pitchRad = (this.pitch * Math.PI) / 180;
    const yawRad = (this.yaw * Math.PI) / 180;

    // Spherical to cartesian, Y-up convention adapted for our Z-up terrain
    // In our coordinate system: X = east, Y = north, Z = up
    const cosPitch = Math.cos(pitchRad);
    const dx = this.distance * cosPitch * Math.sin(yawRad);
    const dy = -this.distance * cosPitch * Math.cos(yawRad);
    const dz = -this.distance * Math.sin(pitchRad);

    this.position = [
      this.target[0] + dx,
      this.target[1] + dy,
      this.target[2] + dz,
    ];
    this.dirty = true;
  }

  /** Update matrices (call before rendering) */
  updateMatrices(aspectRatio: number): void {
    if (!this.dirty) return;

    // Perspective projection
    const fovRad = (this.fov * Math.PI) / 180;
    this.projectionMatrix = perspective(fovRad, aspectRatio, this.near, this.far);

    // View matrix (look-at)
    const up: Vec3 = [0, 0, 1]; // Z-up
    this.viewMatrix = lookAt(this.position, this.target, up);

    // Combined view-projection
    this.viewProjectionMatrix = multiply(this.projectionMatrix, this.viewMatrix);

    // Inverse for unprojection (computed lazily)
    this.inverseViewProjectionMatrix = null;

    this.dirty = false;
  }

  /** Get combined view-projection matrix */
  getViewProjectionMatrix(): Mat4 {
    return this.viewProjectionMatrix;
  }

  /** Get view matrix only */
  getViewMatrix(): Mat4 {
    return this.viewMatrix;
  }

  /** Get projection matrix only */
  getProjectionMatrix(): Mat4 {
    return this.projectionMatrix;
  }

  /** Orbit the camera around the target point */
  orbit(deltaYaw: number, deltaPitch: number): void {
    this.yaw += deltaYaw;
    this.pitch = Math.max(
      Camera3D.MIN_PITCH,
      Math.min(Camera3D.MAX_PITCH, this.pitch + deltaPitch)
    );
    this.updatePositionFromOrbit();
  }

  /** Pan the camera in screen space */
  pan(deltaX: number, deltaY: number, viewportWidth: number, viewportHeight: number): void {
    // Get right and up vectors in world space from view matrix
    // View matrix columns are the camera axes
    const right: Vec3 = [
      this.viewMatrix[0]!,
      this.viewMatrix[4]!,
      this.viewMatrix[8]!,
    ];
    const up: Vec3 = [
      this.viewMatrix[1]!,
      this.viewMatrix[5]!,
      this.viewMatrix[9]!,
    ];

    // Scale movement based on distance and viewport
    const scale = this.distance * 2 / viewportHeight;

    const rightMove = scaleVec(right, -deltaX * scale);
    const upMove = scaleVec(up, deltaY * scale);

    this.target = add(add(this.target, rightMove), upMove);
    this.updatePositionFromOrbit();
  }

  /** Zoom by changing distance to target */
  zoomBy(delta: number): void {
    const factor = Math.pow(0.9, delta);
    this.distance = Math.max(0.001, Math.min(5, this.distance * factor));

    // Update logical zoom level based on distance
    // Rough mapping: distance 0.1 = zoom 6, distance 0.01 = zoom 10, etc.
    this.zoom = Math.max(
      Camera3D.MIN_ZOOM,
      Math.min(Camera3D.MAX_ZOOM, Math.round(6 - Math.log2(this.distance / 0.1)))
    );

    this.updatePositionFromOrbit();
  }

  /** Set camera to look at a specific world position */
  lookAtPosition(x: number, y: number, z: number = 0): void {
    this.target = [x, y, z];
    this.updatePositionFromOrbit();
  }

  /** Get logical zoom level for tile loading */
  getTileZoom(): number {
    return Math.floor(this.zoom);
  }

  /** Get visible bounds (approximate, for culling) */
  getVisibleBounds(viewportWidth: number, viewportHeight: number): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    // Approximate bounds based on target and distance
    const viewSize = this.distance * 2;
    const aspect = viewportWidth / viewportHeight;

    return {
      left: this.target[0] - viewSize * aspect / 2,
      right: this.target[0] + viewSize * aspect / 2,
      top: this.target[1] - viewSize / 2,
      bottom: this.target[1] + viewSize / 2,
    };
  }

  /** Convert screen coordinates to world ray */
  screenToRay(
    screenX: number,
    screenY: number,
    viewportWidth: number,
    viewportHeight: number
  ): { origin: Vec3; direction: Vec3 } {
    // Ensure inverse matrix is computed
    if (!this.inverseViewProjectionMatrix) {
      this.inverseViewProjectionMatrix = invert(this.viewProjectionMatrix);
    }

    if (!this.inverseViewProjectionMatrix) {
      return { origin: this.position, direction: [0, 0, -1] };
    }

    // Convert screen to NDC (-1 to 1)
    const ndcX = (screenX / viewportWidth) * 2 - 1;
    const ndcY = 1 - (screenY / viewportHeight) * 2;

    // Unproject near and far points
    const invVP = this.inverseViewProjectionMatrix;

    // Near point (z = -1 in NDC)
    const nearW = invVP[3]! * ndcX + invVP[7]! * ndcY + invVP[11]! * -1 + invVP[15]!;
    const nearX = (invVP[0]! * ndcX + invVP[4]! * ndcY + invVP[8]! * -1 + invVP[12]!) / nearW;
    const nearY = (invVP[1]! * ndcX + invVP[5]! * ndcY + invVP[9]! * -1 + invVP[13]!) / nearW;
    const nearZ = (invVP[2]! * ndcX + invVP[6]! * ndcY + invVP[10]! * -1 + invVP[14]!) / nearW;

    // Far point (z = 1 in NDC)
    const farW = invVP[3]! * ndcX + invVP[7]! * ndcY + invVP[11]! * 1 + invVP[15]!;
    const farX = (invVP[0]! * ndcX + invVP[4]! * ndcY + invVP[8]! * 1 + invVP[12]!) / farW;
    const farY = (invVP[1]! * ndcX + invVP[5]! * ndcY + invVP[9]! * 1 + invVP[13]!) / farW;
    const farZ = (invVP[2]! * ndcX + invVP[6]! * ndcY + invVP[10]! * 1 + invVP[14]!) / farW;

    const origin: Vec3 = [nearX, nearY, nearZ];
    const direction = normalize(subtract([farX, farY, farZ], origin));

    return { origin, direction };
  }

  /** Intersect a ray with the terrain plane at z = height */
  rayIntersectPlane(
    origin: Vec3,
    direction: Vec3,
    planeZ: number = 0
  ): Vec3 | null {
    // Plane equation: z = planeZ
    // Ray: p = origin + t * direction
    // Solve for t: origin.z + t * direction.z = planeZ

    if (Math.abs(direction[2]) < 0.0001) {
      return null; // Ray parallel to plane
    }

    const t = (planeZ - origin[2]) / direction[2];
    if (t < 0) {
      return null; // Intersection behind camera
    }

    return [
      origin[0] + t * direction[0],
      origin[1] + t * direction[1],
      planeZ,
    ];
  }

  /** Convert screen position to world position on the terrain plane */
  screenToWorld(
    screenX: number,
    screenY: number,
    viewportWidth: number,
    viewportHeight: number,
    terrainHeight: number = 0
  ): Vec3 | null {
    const ray = this.screenToRay(screenX, screenY, viewportWidth, viewportHeight);
    return this.rayIntersectPlane(ray.origin, ray.direction, terrainHeight);
  }

  /**
   * Zoom at a specific screen point.
   * Keeps the world position under the cursor fixed.
   */
  zoomAt(
    delta: number,
    screenX: number,
    screenY: number,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    // Get world position under cursor before zoom
    const worldBefore = this.screenToWorld(screenX, screenY, viewportWidth, viewportHeight);

    // Apply zoom
    this.zoomBy(delta);

    // Get world position under cursor after zoom
    if (worldBefore) {
      const worldAfter = this.screenToWorld(screenX, screenY, viewportWidth, viewportHeight);
      if (worldAfter) {
        // Adjust target to keep world position under cursor
        this.target = [
          this.target[0] + (worldBefore[0] - worldAfter[0]),
          this.target[1] + (worldBefore[1] - worldAfter[1]),
          this.target[2],
        ];
        this.updatePositionFromOrbit();
      }
    }
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
    this.zoomVelocity += delta;
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
    if (Math.abs(this.zoomVelocity) < Camera3D.ZOOM_VELOCITY_THRESHOLD) {
      this.zoomVelocity = 0;
      return false;
    }

    this.zoomAt(
      this.zoomVelocity * dt * 60,
      this.zoomAnchorX,
      this.zoomAnchorY,
      this.lastViewportWidth,
      this.lastViewportHeight
    );

    this.zoomVelocity *= Math.pow(Camera3D.ZOOM_DECAY, dt);
    return true;
  }

  /** Check if zoom animation is active */
  isZoomAnimating(): boolean {
    return Math.abs(this.zoomVelocity) >= Camera3D.ZOOM_VELOCITY_THRESHOLD;
  }

  /**
   * Get the current view-projection matrix.
   * If viewport dimensions are provided, updates matrices first.
   * Alias for getViewProjectionMatrix() for compatibility with 2D Camera.
   */
  getMatrix(viewportWidth?: number, viewportHeight?: number): Mat4 {
    if (viewportWidth !== undefined && viewportHeight !== undefined) {
      this.updateMatrices(viewportWidth / viewportHeight);
    }
    return this.viewProjectionMatrix;
  }
}
