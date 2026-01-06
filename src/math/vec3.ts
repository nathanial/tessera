/**
 * 3D vector utilities for terrain and 3D transformations
 */

/** 3D vector as [x, y, z] tuple */
export type Vec3 = [number, number, number];

/** Create a zero vector */
export function create(): Vec3 {
  return [0, 0, 0];
}

/** Create a vector from values */
export function fromValues(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

/** Copy a vector */
export function copy(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

/** Add two vectors */
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Subtract two vectors: a - b */
export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Scale a vector by a scalar */
export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Compute the length of a vector */
export function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/** Compute the squared length of a vector */
export function lengthSquared(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

/** Normalize a vector */
export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len > 0) {
    return [v[0] / len, v[1] / len, v[2] / len];
  }
  return [0, 0, 0];
}

/** Compute dot product of two vectors */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Compute cross product of two vectors */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Negate a vector */
export function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

/** Linear interpolation between two vectors */
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1]),
    a[2] + t * (b[2] - a[2]),
  ];
}

/** Compute distance between two points */
export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

/** Compute squared distance between two points */
export function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}
