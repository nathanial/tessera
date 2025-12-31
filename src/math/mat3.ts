/**
 * 3x3 Matrix utilities for 2D transformations
 * Matrices are stored in column-major order (WebGL convention)
 */

export type Mat3 = Float32Array;

/** Create an identity matrix */
export function create(): Mat3 {
  const m = new Float32Array(9);
  m[0] = 1;
  m[4] = 1;
  m[8] = 1;
  return m;
}

/** Multiply two matrices: out = a * b */
export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float32Array(9);

  // Column 0
  out[0] = a[0]! * b[0]! + a[3]! * b[1]! + a[6]! * b[2]!;
  out[1] = a[1]! * b[0]! + a[4]! * b[1]! + a[7]! * b[2]!;
  out[2] = a[2]! * b[0]! + a[5]! * b[1]! + a[8]! * b[2]!;

  // Column 1
  out[3] = a[0]! * b[3]! + a[3]! * b[4]! + a[6]! * b[5]!;
  out[4] = a[1]! * b[3]! + a[4]! * b[4]! + a[7]! * b[5]!;
  out[5] = a[2]! * b[3]! + a[5]! * b[4]! + a[8]! * b[5]!;

  // Column 2
  out[6] = a[0]! * b[6]! + a[3]! * b[7]! + a[6]! * b[8]!;
  out[7] = a[1]! * b[6]! + a[4]! * b[7]! + a[7]! * b[8]!;
  out[8] = a[2]! * b[6]! + a[5]! * b[7]! + a[8]! * b[8]!;

  return out;
}

/** Create a translation matrix */
export function translate(x: number, y: number): Mat3 {
  const m = create();
  m[6] = x;
  m[7] = y;
  return m;
}

/** Create a scale matrix */
export function scale(sx: number, sy: number): Mat3 {
  const m = new Float32Array(9);
  m[0] = sx;
  m[4] = sy;
  m[8] = 1;
  return m;
}

/** Create an orthographic projection matrix (maps 0,0 to -1,-1 and width,height to 1,1) */
export function projection(width: number, height: number): Mat3 {
  const m = new Float32Array(9);
  m[0] = 2 / width;
  m[4] = -2 / height; // flip Y for screen coordinates
  m[6] = -1;
  m[7] = 1;
  m[8] = 1;
  return m;
}
