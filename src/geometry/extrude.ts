/**
 * Polyline extrusion to triangle ribbon
 */

import type { Coord, ExtrudedLine, ExtrudeOptions, CapStyle } from "./types";

// Vertex stride: x, y, nx, ny, side
const STRIDE = 5;

/**
 * Normalize a 2D vector in-place and return it.
 */
function normalize(v: [number, number]): [number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (len > 0) {
    v[0] /= len;
    v[1] /= len;
  }
  return v;
}

/**
 * Compute perpendicular normal to a segment (90 degrees CCW).
 */
function perpendicular(dx: number, dy: number): [number, number] {
  return normalize([-dy, dx]);
}

/**
 * Compute miter direction and scale for a corner.
 * Returns [miterX, miterY, miterScale].
 */
function computeMiter(
  n1: [number, number],
  n2: [number, number],
  miterLimit: number
): [number, number, number] {
  // Miter direction is the average of the two normals
  let mx = n1[0] + n2[0];
  let my = n1[1] + n2[1];
  const len = Math.sqrt(mx * mx + my * my);

  if (len < 0.0001) {
    // Parallel lines (180-degree turn), use n1
    return [n1[0], n1[1], 1];
  }

  mx /= len;
  my /= len;

  // Miter scale = 1 / dot(miter, normal)
  const dot = mx * n1[0] + my * n1[1];
  let scale = Math.abs(dot) > 0.0001 ? 1 / dot : 1;

  // Apply miter limit
  scale = Math.min(scale, miterLimit);

  return [mx, my, scale];
}

/**
 * Add vertices for a round cap.
 */
function addRoundCap(
  vertices: number[],
  indices: number[],
  point: Coord,
  normal: [number, number],
  isStart: boolean,
  baseIndex: number
): number {
  const segments = 8;
  const centerIndex = baseIndex;
  const startAngle = Math.atan2(normal[1], normal[0]);

  // Center vertex (no extrusion)
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

/**
 * Add vertices for a square cap.
 */
function addSquareCap(
  vertices: number[],
  indices: number[],
  point: Coord,
  normal: [number, number],
  direction: [number, number],
  isStart: boolean,
  baseIndex: number
): number {
  // Extend in the line direction
  const sign = isStart ? -1 : 1;
  const extX = direction[0] * sign;
  const extY = direction[1] * sign;

  // Add four vertices for the square extension
  // Two at the current point (connected to line), two extended
  vertices.push(
    point[0], point[1], normal[0], normal[1], 1,  // left at point
    point[0], point[1], normal[0], normal[1], -1, // right at point
    point[0], point[1], extX + normal[0], extY + normal[1], 1,  // left extended
    point[0], point[1], extX + normal[0], extY + normal[1], -1  // right extended
  );

  // Two triangles for the square
  indices.push(
    baseIndex, baseIndex + 1, baseIndex + 2,
    baseIndex + 1, baseIndex + 3, baseIndex + 2
  );

  return baseIndex + 4;
}

/**
 * Extrude a polyline into a triangle mesh suitable for rendering.
 *
 * Each vertex contains: [x, y, normalX, normalY, side]
 * - position (x, y): Base line coordinate
 * - normal (nx, ny): Extrusion direction
 * - side: Miter scale (+/- value, positive for left, negative for right)
 *
 * @param coords - Line coordinates [[x,y], [x,y], ...]
 * @param options - Extrusion options
 */
export function extrudeLine(
  coords: Coord[],
  options: ExtrudeOptions = {}
): ExtrudedLine {
  const { cap = "butt", miterLimit = 10 } = options;

  if (coords.length < 2) {
    return {
      vertices: new Float32Array(0),
      indices: new Uint16Array(0),
    };
  }

  const vertices: number[] = [];
  const indices: number[] = [];

  // Compute segment normals and directions
  const normals: [number, number][] = [];
  const directions: [number, number][] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    directions.push(normalize([dx, dy]));
    normals.push(perpendicular(dx, dy));
  }

  // Process each vertex
  for (let i = 0; i < coords.length; i++) {
    const point = coords[i]!;

    let miterX: number, miterY: number, miterScale: number;

    if (i === 0) {
      // Start point
      [miterX, miterY] = normals[0]!;
      miterScale = 1;
    } else if (i === coords.length - 1) {
      // End point
      [miterX, miterY] = normals[normals.length - 1]!;
      miterScale = 1;
    } else {
      // Interior vertex with miter join
      [miterX, miterY, miterScale] = computeMiter(
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

  // Generate indices for triangle strip (two triangles per segment)
  for (let i = 0; i < coords.length - 1; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  // Handle caps
  if (cap !== "butt") {
    let nextIndex = coords.length * 2;

    if (cap === "round") {
      // Start cap
      nextIndex = addRoundCap(
        vertices, indices,
        coords[0]!,
        normals[0]!,
        true,
        nextIndex
      );

      // End cap
      addRoundCap(
        vertices, indices,
        coords[coords.length - 1]!,
        normals[normals.length - 1]!,
        false,
        nextIndex
      );
    } else if (cap === "square") {
      // Start cap
      nextIndex = addSquareCap(
        vertices, indices,
        coords[0]!,
        normals[0]!,
        directions[0]!,
        true,
        nextIndex
      );

      // End cap
      addSquareCap(
        vertices, indices,
        coords[coords.length - 1]!,
        normals[normals.length - 1]!,
        directions[directions.length - 1]!,
        false,
        nextIndex
      );
    }
  }

  const vertexArray = new Float32Array(vertices);
  const indexArray =
    vertices.length / STRIDE > 65535
      ? new Uint32Array(indices)
      : new Uint16Array(indices);

  return { vertices: vertexArray, indices: indexArray };
}

/** GeoJSON LineString type */
interface GeoJSONLineString {
  type: "LineString";
  coordinates: number[][];
}

/** GeoJSON MultiLineString type */
interface GeoJSONMultiLineString {
  type: "MultiLineString";
  coordinates: number[][][];
}

/**
 * Extrude a GeoJSON LineString or MultiLineString.
 *
 * @param geometry - GeoJSON LineString or MultiLineString geometry
 * @param options - Extrusion options
 */
export function extrudeGeoJSON(
  geometry: GeoJSONLineString | GeoJSONMultiLineString,
  options: ExtrudeOptions = {}
): ExtrudedLine {
  if (geometry.type === "LineString") {
    return extrudeLine(geometry.coordinates as Coord[], options);
  }

  // MultiLineString: extrude each and merge
  const allVertices: number[] = [];
  const allIndices: number[] = [];

  for (const line of geometry.coordinates) {
    const result = extrudeLine(line as Coord[], options);

    const indexOffset = allVertices.length / STRIDE;
    for (let i = 0; i < result.vertices.length; i++) {
      allVertices.push(result.vertices[i]!);
    }
    for (let i = 0; i < result.indices.length; i++) {
      allIndices.push(result.indices[i]! + indexOffset);
    }
  }

  const vertices = new Float32Array(allVertices);
  const indices =
    allVertices.length / STRIDE > 65535
      ? new Uint32Array(allIndices)
      : new Uint16Array(allIndices);

  return { vertices, indices };
}
