/**
 * Geometry generation types
 */

/** Coordinate as [x, y] */
export type Coord = [number, number];

/** Ring of coordinates (for polygons) */
export type Ring = Coord[];

/** Tessellated polygon result with vertices and indices */
export interface TessellatedPolygon {
  /** Interleaved vertex data [x, y, x, y, ...] */
  vertices: Float32Array;
  /** Triangle indices */
  indices: Uint16Array | Uint32Array;
}

/** Extruded polyline result */
export interface ExtrudedLine {
  /** Interleaved vertex data [x, y, nx, ny, side, ...] */
  vertices: Float32Array;
  /** Triangle indices */
  indices: Uint16Array | Uint32Array;
}

/** Cap style for line ends */
export type CapStyle = "butt" | "square" | "round";

/** Join style for line vertices */
export type JoinStyle = "miter" | "bevel" | "round";

/** Line extrusion options */
export interface ExtrudeOptions {
  /** Cap style for line ends (default: butt) */
  cap?: CapStyle;
  /** Join style for vertices (default: miter) */
  join?: JoinStyle;
  /** Miter limit before fallback to bevel (default: 10) */
  miterLimit?: number;
}
