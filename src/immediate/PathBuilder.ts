/**
 * Path builder for immediate mode rendering
 *
 * Accumulates path commands (moveTo, lineTo, arc, etc.) and can convert
 * the path to triangles for filling or extruded geometry for stroking.
 */

import type { LineCap } from "./DrawState";
import { extrudePolyline } from "../geometry/extrude";
import { tessellatePolygon } from "../geometry/tessellate";
import type { Vec2 } from "../math/vec2";

export type Coord = Vec2;

interface SubPath {
  points: Coord[];
  closed: boolean;
}

// Vertex stride for stroke geometry: x, y, nx, ny, side
const STROKE_STRIDE = 5;

export class PathBuilder {
  private subPaths: SubPath[] = [];
  private currentSubPath: SubPath | null = null;
  private currentPoint: Coord = [0, 0];

  /**
   * Start a new path (clears existing path data)
   */
  beginPath(): void {
    this.subPaths = [];
    this.currentSubPath = null;
  }

  /**
   * Move to a new position, starting a new sub-path
   */
  moveTo(x: number, y: number): void {
    this.currentSubPath = { points: [[x, y]], closed: false };
    this.subPaths.push(this.currentSubPath);
    this.currentPoint = [x, y];
  }

  /**
   * Draw a line from current position to (x, y)
   */
  lineTo(x: number, y: number): void {
    if (!this.currentSubPath) {
      this.moveTo(x, y);
      return;
    }
    this.currentSubPath.points.push([x, y]);
    this.currentPoint = [x, y];
  }

  /**
   * Draw an arc
   * @param cx - Center X
   * @param cy - Center Y
   * @param radius - Arc radius
   * @param startAngle - Start angle in radians
   * @param endAngle - End angle in radians
   * @param counterclockwise - Draw counterclockwise
   */
  arc(
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise: boolean = false
  ): void {
    // Calculate number of segments based on arc length
    let angleDiff = endAngle - startAngle;
    if (counterclockwise) {
      if (angleDiff > 0) angleDiff -= Math.PI * 2;
    } else {
      if (angleDiff < 0) angleDiff += Math.PI * 2;
    }

    const absAngle = Math.abs(angleDiff);
    // Use 32 segments for a full circle, scaled by arc angle
    const segments = Math.max(8, Math.ceil((absAngle / (Math.PI * 2)) * 32));

    // Start point
    const startX = cx + Math.cos(startAngle) * radius;
    const startY = cy + Math.sin(startAngle) * radius;

    // If no current sub-path, or we need to connect to the arc start
    if (!this.currentSubPath) {
      this.moveTo(startX, startY);
    } else {
      // Line to arc start if not already there
      const [curX, curY] = this.currentPoint;
      if (Math.abs(curX - startX) > 0.001 || Math.abs(curY - startY) > 0.001) {
        this.lineTo(startX, startY);
      }
    }

    // Add arc points
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + angleDiff * t;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      this.lineTo(x, y);
    }
  }

  /**
   * Draw a rectangle path
   */
  rect(x: number, y: number, width: number, height: number): void {
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }

  /**
   * Close the current sub-path
   */
  closePath(): void {
    if (this.currentSubPath && this.currentSubPath.points.length > 0) {
      this.currentSubPath.closed = true;
      // Connect back to start
      const start = this.currentSubPath.points[0]!;
      this.currentPoint = start;
    }
    this.currentSubPath = null;
  }

  /**
   * Check if path has any content
   */
  isEmpty(): boolean {
    return this.subPaths.length === 0;
  }

  /**
   * Tessellate the path for filling
   * Returns vertices and indices for triangle rendering
   */
  tessellate(): { vertices: Float32Array; indices: Uint16Array | Uint32Array } {
    if (this.subPaths.length === 0) {
      return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }

    // For filling, we need closed paths
    // Treat each closed sub-path as a separate polygon
    // (Future: support holes by detecting winding order)

    const allVertices: number[] = [];
    const allIndices: number[] = [];

    for (const subPath of this.subPaths) {
      if (subPath.points.length < 3) continue;

      const result = tessellatePolygon(subPath.points);

      // Add to combined arrays
      const indexOffset = allVertices.length / 2;
      for (let i = 0; i < result.vertices.length; i++) {
        allVertices.push(result.vertices[i]!);
      }
      for (let i = 0; i < result.indices.length; i++) {
        allIndices.push(result.indices[i]! + indexOffset);
      }
    }

    const vertices = new Float32Array(allVertices);
    const indices =
      allVertices.length / 2 > 65535
        ? new Uint32Array(allIndices)
        : new Uint16Array(allIndices);

    return { vertices, indices };
  }

  /**
   * Extrude the path for stroking
   * Returns vertices and indices for triangle rendering
   *
   * Vertex format: [x, y, nx, ny, side]
   * - (x, y): Base position
   * - (nx, ny): Normal direction for extrusion
   * - side: Miter scale (+/- for left/right)
   */
  extrude(
    cap: LineCap = "butt",
    miterLimit: number = 10
  ): { vertices: Float32Array; indices: Uint16Array | Uint32Array } {
    if (this.subPaths.length === 0) {
      return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }

    const allVertices: number[] = [];
    const allIndices: number[] = [];

    for (const subPath of this.subPaths) {
      const coords = subPath.points;
      if (coords.length < 2) continue;

      const baseIndex = allVertices.length / STROKE_STRIDE;
      const result = extrudePolyline(coords, {
        cap,
        miterLimit,
        closed: subPath.closed,
      });

      for (let i = 0; i < result.vertices.length; i++) {
        allVertices.push(result.vertices[i]!);
      }
      for (let i = 0; i < result.indices.length; i++) {
        allIndices.push(result.indices[i]! + baseIndex);
      }
    }

    const vertices = new Float32Array(allVertices);
    const indices =
      allVertices.length / STROKE_STRIDE > 65535
        ? new Uint32Array(allIndices)
        : new Uint16Array(allIndices);

    return { vertices, indices };
  }

}
