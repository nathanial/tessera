import { describe, it, expect } from "vitest";
import { tessellatePolygon, tessellateGeoJSON } from "./tessellate";

describe("tessellatePolygon", () => {
  it("tessellates a simple triangle", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ];
    const result = tessellatePolygon(triangle);

    expect(result.vertices).toHaveLength(6); // 3 vertices * 2 coords
    expect(result.indices).toHaveLength(3); // 1 triangle
  });

  it("tessellates a square into 2 triangles", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const result = tessellatePolygon(square);

    expect(result.vertices).toHaveLength(8); // 4 vertices * 2 coords
    expect(result.indices).toHaveLength(6); // 2 triangles * 3 indices
  });

  it("handles polygons with holes", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hole: [number, number][] = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ];

    const result = tessellatePolygon(outer, [hole]);

    expect(result.vertices).toHaveLength(16); // 8 vertices total
    expect(result.indices.length).toBeGreaterThan(6); // More triangles needed for hole
  });

  it("uses Uint16Array for small polygons", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [1, 0],
      [0.5, 1],
    ];
    const result = tessellatePolygon(triangle);

    expect(result.indices).toBeInstanceOf(Uint16Array);
  });

  it("handles complex concave polygon", () => {
    // L-shaped polygon
    const lShape: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ];
    const result = tessellatePolygon(lShape);

    expect(result.vertices).toHaveLength(12); // 6 vertices * 2 coords
    expect(result.indices).toHaveLength(12); // 4 triangles * 3 indices
  });
});

describe("tessellateGeoJSON", () => {
  it("tessellates a GeoJSON Polygon", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };

    const result = tessellateGeoJSON(polygon);

    expect(result.vertices).toHaveLength(10); // 5 vertices * 2 coords
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it("tessellates a GeoJSON Polygon with hole", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [8, 2],
          [8, 8],
          [2, 8],
          [2, 2],
        ],
      ],
    };

    const result = tessellateGeoJSON(polygon);

    expect(result.vertices).toHaveLength(20); // 10 vertices * 2 coords
    expect(result.indices.length).toBeGreaterThan(6);
  });

  it("tessellates a GeoJSON MultiPolygon", () => {
    const multiPolygon = {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        ],
      ],
    };

    const result = tessellateGeoJSON(multiPolygon);

    // 2 polygons * 5 vertices each * 2 coords
    expect(result.vertices).toHaveLength(20);
    // At least 4 triangles total (2 per square)
    expect(result.indices.length).toBeGreaterThanOrEqual(12);
  });

  it("handles empty polygon coordinates", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [],
    };

    const result = tessellateGeoJSON(polygon);

    expect(result.vertices).toHaveLength(0);
    expect(result.indices).toHaveLength(0);
  });
});
