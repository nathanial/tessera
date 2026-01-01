import { describe, it, expect } from "vitest";
import { extrudeLine, extrudeGeoJSON } from "./extrude";

// Vertex stride: x, y, nx, ny, side
const STRIDE = 5;

describe("extrudeLine", () => {
  it("returns empty arrays for lines with fewer than 2 points", () => {
    const result = extrudeLine([[0, 0]]);

    expect(result.vertices).toHaveLength(0);
    expect(result.indices).toHaveLength(0);
  });

  it("extrudes a simple 2-point line", () => {
    const result = extrudeLine([
      [0, 0],
      [1, 0],
    ]);

    // 2 vertices * 2 sides = 4 vertex records
    expect(result.vertices).toHaveLength(4 * STRIDE);

    // 2 triangles = 6 indices
    expect(result.indices).toHaveLength(6);
  });

  it("produces correct normals for horizontal line", () => {
    const result = extrudeLine([
      [0, 0],
      [1, 0],
    ]);
    const vertices = result.vertices;

    // First vertex: position at (0, 0), normal pointing up (0, 1)
    expect(vertices[0]).toBe(0); // x
    expect(vertices[1]).toBe(0); // y
    expect(vertices[2]).toBeCloseTo(0); // nx
    expect(vertices[3]).toBeCloseTo(1); // ny (perpendicular to horizontal = up)
    expect(vertices[4]).toBeCloseTo(1); // side (left, positive miter scale)
  });

  it("produces correct normals for vertical line", () => {
    const result = extrudeLine([
      [0, 0],
      [0, 1],
    ]);
    const vertices = result.vertices;

    // Normal should be perpendicular to vertical = left (-1, 0)
    expect(vertices[2]).toBeCloseTo(-1); // nx
    expect(vertices[3]).toBeCloseTo(0); // ny
  });

  it("handles 3-point line with miter join", () => {
    // L-shaped line
    const result = extrudeLine([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);

    // 3 vertices * 2 sides = 6 vertex records
    expect(result.vertices).toHaveLength(6 * STRIDE);

    // 4 triangles (2 per segment)
    expect(result.indices).toHaveLength(12);
  });

  it("applies miter limit on sharp angles", () => {
    // Very sharp angle (almost 180-degree turn)
    const result = extrudeLine([
      [0, 0],
      [1, 0],
      [0.9, 0.1],
    ]);

    // The miter at the middle vertex should be limited
    // Check that the side value (miter scale) is reasonable
    const middleLeftSide = Math.abs(result.vertices[2 * STRIDE + 4]!);
    expect(middleLeftSide).toBeLessThanOrEqual(10); // Default miter limit
  });

  it("generates butt caps by default (no extra vertices)", () => {
    const result = extrudeLine([
      [0, 0],
      [1, 0],
    ]);

    // Just the line vertices, no cap geometry
    expect(result.vertices).toHaveLength(4 * STRIDE);
  });

  it("generates square caps when specified", () => {
    const result = extrudeLine(
      [
        [0, 0],
        [1, 0],
      ],
      { cap: "square" }
    );

    // Square caps add 4 vertices each (2 caps * 4 = 8 extra)
    expect(result.vertices.length).toBeGreaterThan(4 * STRIDE);
  });

  it("generates round caps when specified", () => {
    const result = extrudeLine(
      [
        [0, 0],
        [1, 0],
      ],
      { cap: "round" }
    );

    // Round caps add multiple vertices for the arc
    expect(result.vertices.length).toBeGreaterThan(4 * STRIDE);
  });

  it("uses Uint16Array for small lines", () => {
    const result = extrudeLine([
      [0, 0],
      [1, 0],
    ]);

    expect(result.indices).toBeInstanceOf(Uint16Array);
  });

  it("handles custom miter limit", () => {
    // Sharp 45-degree angle
    const result = extrudeLine(
      [
        [0, 0],
        [1, 0],
        [1.5, 0.5],
      ],
      { miterLimit: 2 }
    );

    // The miter should be clamped to 2
    const middleLeftSide = Math.abs(result.vertices[2 * STRIDE + 4]!);
    expect(middleLeftSide).toBeLessThanOrEqual(2);
  });
});

describe("extrudeGeoJSON", () => {
  it("extrudes a GeoJSON LineString", () => {
    const lineString = {
      type: "LineString" as const,
      coordinates: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    };

    const result = extrudeGeoJSON(lineString);

    // 3 vertices * 2 sides = 6 vertex records
    expect(result.vertices).toHaveLength(6 * STRIDE);
    expect(result.indices).toHaveLength(12); // 4 triangles
  });

  it("extrudes a GeoJSON MultiLineString", () => {
    const multiLineString = {
      type: "MultiLineString" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 0],
          [3, 0],
        ],
      ],
    };

    const result = extrudeGeoJSON(multiLineString);

    // 2 lines * 2 vertices * 2 sides = 8 vertex records
    expect(result.vertices).toHaveLength(8 * STRIDE);

    // 2 lines * 2 triangles = 12 indices
    expect(result.indices).toHaveLength(12);
  });

  it("applies options to all lines in MultiLineString", () => {
    const multiLineString = {
      type: "MultiLineString" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 0],
          [3, 0],
        ],
      ],
    };

    const result = extrudeGeoJSON(multiLineString, { cap: "round" });

    // Both lines should have round caps, so more vertices than default
    expect(result.vertices.length).toBeGreaterThan(8 * STRIDE);
  });

  it("handles empty MultiLineString", () => {
    const multiLineString = {
      type: "MultiLineString" as const,
      coordinates: [],
    };

    const result = extrudeGeoJSON(multiLineString);

    expect(result.vertices).toHaveLength(0);
    expect(result.indices).toHaveLength(0);
  });
});
