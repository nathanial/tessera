/**
 * Polygon tessellation using earcut
 */

import earcut from "earcut";
import type { Ring, TessellatedPolygon } from "./types";

/**
 * Tessellate a polygon (with optional holes) into triangles.
 *
 * @param outer - Outer ring coordinates [[x,y], [x,y], ...]
 * @param holes - Optional array of hole rings
 * @returns Tessellated polygon with vertices and indices
 */
export function tessellatePolygon(
  outer: Ring,
  holes: Ring[] = []
): TessellatedPolygon {
  // Flatten coordinates for earcut
  const coords: number[] = [];
  const holeIndices: number[] = [];

  // Add outer ring
  for (const [x, y] of outer) {
    coords.push(x, y);
  }

  // Add holes
  for (const hole of holes) {
    holeIndices.push(coords.length / 2);
    for (const [x, y] of hole) {
      coords.push(x, y);
    }
  }

  // Run earcut
  const indices = earcut(
    coords,
    holeIndices.length > 0 ? holeIndices : undefined,
    2
  );

  // Convert to typed arrays
  const vertices = new Float32Array(coords);
  const indexArray =
    coords.length / 2 > 65535
      ? new Uint32Array(indices)
      : new Uint16Array(indices);

  return { vertices, indices: indexArray };
}

/** GeoJSON Polygon type */
interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/** GeoJSON MultiPolygon type */
interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

/**
 * Tessellate a GeoJSON Polygon or MultiPolygon.
 *
 * @param geometry - GeoJSON Polygon or MultiPolygon geometry
 * @returns Tessellated polygon with vertices and indices
 */
export function tessellateGeoJSON(
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon
): TessellatedPolygon {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!outer) {
      return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }
    return tessellatePolygon(outer as Ring, holes as Ring[]);
  }

  // MultiPolygon: tessellate each and merge
  const allVertices: number[] = [];
  const allIndices: number[] = [];

  for (const polygon of geometry.coordinates) {
    const [outer, ...holes] = polygon;
    if (!outer) continue;

    const result = tessellatePolygon(outer as Ring, holes as Ring[]);

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
