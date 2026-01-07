import { Geometry, type AttributeLayout } from "../Geometry";
import type { Color } from "../types/color";

export type QuadCorner = [number, number, number, number];

const QUAD_STRIDE_BYTES = 40;

const QUAD_ATTRIBUTES: AttributeLayout[] = [
  { location: 0, size: 2, stride: QUAD_STRIDE_BYTES, offset: 0 },  // anchor
  { location: 1, size: 2, stride: QUAD_STRIDE_BYTES, offset: 8 },  // offset
  { location: 2, size: 2, stride: QUAD_STRIDE_BYTES, offset: 16 }, // texCoord
  { location: 3, size: 4, stride: QUAD_STRIDE_BYTES, offset: 24 }, // color
];

export function appendQuad(
  vertices: number[],
  indices: number[],
  anchorX: number,
  anchorY: number,
  corners: QuadCorner[],
  color: Color,
  vertexCount: number,
  cos: number,
  sin: number,
  postTranslateX: number = 0,
  postTranslateY: number = 0
): number {
  const [r, g, b, a] = color;

  for (const [lx, ly, u, v] of corners) {
    const rx = cos * lx - sin * ly + postTranslateX;
    const ry = sin * lx + cos * ly + postTranslateY;
    vertices.push(anchorX, anchorY, rx, ry, u, v, r, g, b, a);
  }

  indices.push(
    vertexCount, vertexCount + 1, vertexCount + 2,
    vertexCount + 1, vertexCount + 3, vertexCount + 2
  );

  return vertexCount + 4;
}

export function buildQuadGeometry(
  gl: WebGL2RenderingContext,
  vertices: number[],
  indices: number[],
  vertexCount: number
): Geometry | null {
  if (vertices.length === 0) return null;

  const indexData =
    vertexCount > 65535 / 4
      ? new Uint32Array(indices)
      : new Uint16Array(indices);

  return new Geometry(gl, {
    vertices: new Float32Array(vertices),
    indices: indexData,
    attributes: QUAD_ATTRIBUTES,
  });
}
