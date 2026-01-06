/**
 * 4x4 Matrix utilities for 3D transformations
 * Matrices are stored in column-major order (WebGL convention)
 *
 * Column-major layout:
 * [0]  [4]  [8]  [12]     m00 m10 m20 m30
 * [1]  [5]  [9]  [13]  =  m01 m11 m21 m31
 * [2]  [6]  [10] [14]     m02 m12 m22 m32
 * [3]  [7]  [11] [15]     m03 m13 m23 m33
 */

import type { Vec3 } from "./vec3";

export type Mat4 = Float32Array;

/** Create an identity matrix */
export function create(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** Set a matrix to identity */
export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

/** Copy a matrix */
export function copy(m: Mat4): Mat4 {
  return new Float32Array(m);
}

/** Multiply two matrices: out = a * b */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);

  const a00 = a[0]!,
    a01 = a[1]!,
    a02 = a[2]!,
    a03 = a[3]!;
  const a10 = a[4]!,
    a11 = a[5]!,
    a12 = a[6]!,
    a13 = a[7]!;
  const a20 = a[8]!,
    a21 = a[9]!,
    a22 = a[10]!,
    a23 = a[11]!;
  const a30 = a[12]!,
    a31 = a[13]!,
    a32 = a[14]!,
    a33 = a[15]!;

  // Column 0
  let b0 = b[0]!,
    b1 = b[1]!,
    b2 = b[2]!,
    b3 = b[3]!;
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  // Column 1
  b0 = b[4]!;
  b1 = b[5]!;
  b2 = b[6]!;
  b3 = b[7]!;
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  // Column 2
  b0 = b[8]!;
  b1 = b[9]!;
  b2 = b[10]!;
  b3 = b[11]!;
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  // Column 3
  b0 = b[12]!;
  b1 = b[13]!;
  b2 = b[14]!;
  b3 = b[15]!;
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
}

/** Create a perspective projection matrix */
export function perspective(
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(fovY / 2);
  const rangeInv = 1 / (near - far);

  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * rangeInv;
  out[11] = -1;
  out[14] = 2 * far * near * rangeInv;

  return out;
}

/** Create a look-at view matrix */
export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const out = new Float32Array(16);

  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];

  let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  const z0 = len > 0 ? zx / len : 0;
  const z1 = len > 0 ? zy / len : 0;
  const z2 = len > 0 ? zz / len : 0;

  // x = up cross z
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;

  len = Math.sqrt(xx * xx + xy * xy + xz * xz);
  const x0 = len > 0 ? xx / len : 0;
  const x1 = len > 0 ? xy / len : 0;
  const x2 = len > 0 ? xz / len : 0;

  // y = z cross x
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;

  return out;
}

/** Create a translation matrix */
export function translate(x: number, y: number, z: number): Mat4 {
  const out = create();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

/** Create a scale matrix */
export function scale(sx: number, sy: number, sz: number): Mat4 {
  const out = new Float32Array(16);
  out[0] = sx;
  out[5] = sy;
  out[10] = sz;
  out[15] = 1;
  return out;
}

/** Create an X-axis rotation matrix */
export function rotateX(angle: number): Mat4 {
  const out = create();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

/** Create a Y-axis rotation matrix */
export function rotateY(angle: number): Mat4 {
  const out = create();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

/** Create a Z-axis rotation matrix */
export function rotateZ(angle: number): Mat4 {
  const out = create();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

/** Invert a matrix, returns null if not invertible */
export function invert(m: Mat4): Mat4 | null {
  const out = new Float32Array(16);

  const a00 = m[0]!,
    a01 = m[1]!,
    a02 = m[2]!,
    a03 = m[3]!;
  const a10 = m[4]!,
    a11 = m[5]!,
    a12 = m[6]!,
    a13 = m[7]!;
  const a20 = m[8]!,
    a21 = m[9]!,
    a22 = m[10]!,
    a23 = m[11]!;
  const a30 = m[12]!,
    a31 = m[13]!,
    a32 = m[14]!,
    a33 = m[15]!;

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

  if (!det) {
    return null;
  }
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

  return out;
}

/** Transform a Vec3 by a Mat4 (assumes w=1 for position) */
export function transformPoint(m: Mat4, v: Vec3): Vec3 {
  const x = v[0],
    y = v[1],
    z = v[2];
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const invW = w ? 1 / w : 1;

  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * invW,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * invW,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * invW,
  ];
}

/** Transform a Vec3 direction by a Mat4 (ignores translation) */
export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  const x = v[0],
    y = v[1],
    z = v[2];
  return [
    m[0]! * x + m[4]! * y + m[8]! * z,
    m[1]! * x + m[5]! * y + m[9]! * z,
    m[2]! * x + m[6]! * y + m[10]! * z,
  ];
}

/** Create an orthographic projection matrix */
export function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Mat4 {
  const out = new Float32Array(16);
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  out[0] = -2 * lr;
  out[5] = -2 * bt;
  out[10] = 2 * nf;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;

  return out;
}
