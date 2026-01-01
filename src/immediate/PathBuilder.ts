/**
 * Path builder for immediate mode rendering
 *
 * Accumulates path commands (moveTo, lineTo, arc, etc.) and can convert
 * the path to triangles for filling or extruded geometry for stroking.
 */

import earcut from "earcut";
import type { LineCap } from "./DrawState";

export type Coord = [number, number];

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

      // Flatten coordinates for earcut
      const coords: number[] = [];
      for (const [x, y] of subPath.points) {
        coords.push(x, y);
      }

      // Run earcut
      const indices = earcut(coords, undefined, 2);

      // Add to combined arrays
      const indexOffset = allVertices.length / 2;
      for (let i = 0; i < coords.length; i++) {
        allVertices.push(coords[i]!);
      }
      for (let i = 0; i < indices.length; i++) {
        allIndices.push(indices[i]! + indexOffset);
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
      const result = this.extrudePolyline(
        coords,
        subPath.closed,
        cap,
        miterLimit
      );

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

  /**
   * Extrude a single polyline
   */
  private extrudePolyline(
    coords: Coord[],
    closed: boolean,
    cap: LineCap,
    miterLimit: number
  ): { vertices: number[]; indices: number[] } {
    const vertices: number[] = [];
    const indices: number[] = [];

    // Compute segment normals and directions
    const normals: Coord[] = [];
    const directions: Coord[] = [];

    const numSegments = closed ? coords.length : coords.length - 1;

    for (let i = 0; i < numSegments; i++) {
      const p1 = coords[i]!;
      const p2 = coords[(i + 1) % coords.length]!;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      directions.push(this.normalize([dx, dy]));
      normals.push(this.perpendicular(dx, dy));
    }

    // Process each vertex
    for (let i = 0; i < coords.length; i++) {
      const point = coords[i]!;

      let miterX: number, miterY: number, miterScale: number;

      if (closed) {
        // All vertices are interior for closed paths
        const prevIdx = (i - 1 + normals.length) % normals.length;
        const currIdx = i % normals.length;
        [miterX, miterY, miterScale] = this.computeMiter(
          normals[prevIdx]!,
          normals[currIdx]!,
          miterLimit
        );
      } else if (i === 0) {
        // Start point
        [miterX, miterY] = normals[0]!;
        miterScale = 1;
      } else if (i === coords.length - 1) {
        // End point
        [miterX, miterY] = normals[normals.length - 1]!;
        miterScale = 1;
      } else {
        // Interior vertex with miter join
        [miterX, miterY, miterScale] = this.computeMiter(
          normals[i - 1]!,
          normals[i]!,
          miterLimit
        );
      }

      // Add two vertices (left and right sides)
      vertices.push(
        point[0], point[1], miterX, miterY, miterScale,   // left side
        point[0], point[1], miterX, miterY, -miterScale   // right side
      );
    }

    // Generate indices for triangle strip
    const numVerts = coords.length;
    for (let i = 0; i < numSegments; i++) {
      const base = i * 2;
      const next = ((i + 1) % numVerts) * 2;
      indices.push(base, base + 1, next);
      indices.push(base + 1, next + 1, next);
    }

    // Handle caps for open paths
    if (!closed && cap !== "butt") {
      let nextIndex = coords.length * 2;

      if (cap === "round") {
        // Start cap
        nextIndex = this.addRoundCap(
          vertices, indices,
          coords[0]!,
          normals[0]!,
          true,
          nextIndex
        );
        // End cap
        this.addRoundCap(
          vertices, indices,
          coords[coords.length - 1]!,
          normals[normals.length - 1]!,
          false,
          nextIndex
        );
      } else if (cap === "square") {
        // Start cap
        nextIndex = this.addSquareCap(
          vertices, indices,
          coords[0]!,
          normals[0]!,
          directions[0]!,
          true,
          nextIndex
        );
        // End cap
        this.addSquareCap(
          vertices, indices,
          coords[coords.length - 1]!,
          normals[normals.length - 1]!,
          directions[directions.length - 1]!,
          false,
          nextIndex
        );
      }
    }

    return { vertices, indices };
  }

  private normalize(v: Coord): Coord {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    if (len > 0) {
      return [v[0] / len, v[1] / len];
    }
    return [0, 0];
  }

  private perpendicular(dx: number, dy: number): Coord {
    return this.normalize([-dy, dx]);
  }

  private computeMiter(
    n1: Coord,
    n2: Coord,
    miterLimit: number
  ): [number, number, number] {
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const len = Math.sqrt(mx * mx + my * my);

    if (len < 0.0001) {
      return [n1[0], n1[1], 1];
    }

    mx /= len;
    my /= len;

    const dot = mx * n1[0] + my * n1[1];
    let scale = Math.abs(dot) > 0.0001 ? 1 / dot : 1;
    scale = Math.min(scale, miterLimit);

    return [mx, my, scale];
  }

  private addRoundCap(
    vertices: number[],
    indices: number[],
    point: Coord,
    normal: Coord,
    isStart: boolean,
    baseIndex: number
  ): number {
    const segments = 8;
    const centerIndex = baseIndex;
    const startAngle = Math.atan2(normal[1], normal[0]);

    // Center vertex
    vertices.push(point[0], point[1], 0, 0, 0);

    // Arc vertices
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + (isStart ? Math.PI : 0) + t * Math.PI * (isStart ? 1 : -1);
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      vertices.push(point[0], point[1], nx, ny, 1);
    }

    // Fan triangles
    for (let i = 0; i < segments; i++) {
      indices.push(centerIndex, centerIndex + 1 + i, centerIndex + 2 + i);
    }

    return baseIndex + 2 + segments;
  }

  private addSquareCap(
    vertices: number[],
    indices: number[],
    point: Coord,
    normal: Coord,
    direction: Coord,
    isStart: boolean,
    baseIndex: number
  ): number {
    const sign = isStart ? -1 : 1;
    const extX = direction[0] * sign;
    const extY = direction[1] * sign;

    vertices.push(
      point[0], point[1], normal[0], normal[1], 1,
      point[0], point[1], normal[0], normal[1], -1,
      point[0], point[1], extX + normal[0], extY + normal[1], 1,
      point[0], point[1], extX + normal[0], extY + normal[1], -1
    );

    indices.push(
      baseIndex, baseIndex + 1, baseIndex + 2,
      baseIndex + 1, baseIndex + 3, baseIndex + 2
    );

    return baseIndex + 4;
  }
}
