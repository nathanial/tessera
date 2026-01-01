/**
 * Shape Geometry Generators
 *
 * Generate unit geometry for each point shape type.
 * All shapes are centered at origin with diameter/width of 1.
 */

import type { PointShape, ShapeGeometry } from "./types";

/** Number of segments for circle approximation */
const CIRCLE_SEGMENTS = 16;

/**
 * Create geometry for a shape.
 *
 * @param shape - Shape type to generate
 * @returns Shape geometry with vertices and indices
 */
export function createShapeGeometry(shape: PointShape): ShapeGeometry {
  switch (shape) {
    case "circle":
      return createCircleGeometry(CIRCLE_SEGMENTS);
    case "square":
      return createSquareGeometry();
    case "triangle":
      return createTriangleGeometry();
    case "diamond":
      return createDiamondGeometry();
  }
}

/**
 * Create a unit circle as a triangle fan.
 * Center at origin, radius 0.5 (diameter 1).
 */
function createCircleGeometry(segments: number): ShapeGeometry {
  const vertices: number[] = [0, 0]; // Center point
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5);
  }

  // Triangle fan from center
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }
  // Close the fan
  indices.push(0, segments, 1);

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
    vertexCount: segments + 2,
  };
}

/**
 * Create a unit square.
 * Centered at origin with side length 1.
 */
function createSquareGeometry(): ShapeGeometry {
  return {
    vertices: new Float32Array([
      -0.5, -0.5, // Bottom-left
      0.5, -0.5, // Bottom-right
      0.5, 0.5, // Top-right
      -0.5, 0.5, // Top-left
    ]),
    indices: new Uint16Array([
      0, 1, 2, // First triangle
      0, 2, 3, // Second triangle
    ]),
    vertexCount: 4,
  };
}

/**
 * Create an equilateral triangle pointing up.
 * Centered at origin with height approximately 0.866.
 */
function createTriangleGeometry(): ShapeGeometry {
  // Equilateral triangle with centroid at origin
  const h = (Math.sqrt(3) / 2) * 0.5; // Half height
  const cy = h / 3; // Centroid Y offset

  return {
    vertices: new Float32Array([
      0,
      -h - cy, // Bottom vertex
      0.5,
      h - cy, // Top-right vertex
      -0.5,
      h - cy, // Top-left vertex
    ]),
    indices: new Uint16Array([0, 1, 2]),
    vertexCount: 3,
  };
}

/**
 * Create a diamond (rotated square).
 * Centered at origin with diagonal length 1.
 */
function createDiamondGeometry(): ShapeGeometry {
  return {
    vertices: new Float32Array([
      0, -0.5, // Bottom
      0.5, 0, // Right
      0, 0.5, // Top
      -0.5, 0, // Left
    ]),
    indices: new Uint16Array([
      0, 1, 2, // Right half
      0, 2, 3, // Left half
    ]),
    vertexCount: 4,
  };
}
