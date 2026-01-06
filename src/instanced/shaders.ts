/**
 * Instanced Point Shaders (3D with terrain support)
 *
 * Vertex and fragment shaders for GPU-instanced point rendering.
 * Each point instance has its own position (x, y, z), color, size, and rotation.
 */

/**
 * Instanced point vertex shader.
 *
 * Per-vertex attributes (shape geometry):
 * - a_localPosition: Local position within the shape
 *
 * Per-instance attributes:
 * - a_instancePosition: World position (x, y, z with terrain height)
 * - a_instanceColor: RGBA color
 * - a_instanceSize: Size in pixels (diameter)
 * - a_instanceRotation: Rotation in radians
 *
 * Uniforms:
 * - u_matrix: View-projection matrix (mat4)
 * - u_viewport: Viewport size in pixels (vec2)
 */
export const instancedPointVertexShader = `#version 300 es
precision highp float;

// Per-vertex (shape geometry)
in vec2 a_localPosition;

// Per-instance attributes
in vec3 a_instancePosition;  // x, y, z (z from terrain height)
in vec4 a_instanceColor;
in float a_instanceSize;
in float a_instanceRotation;

uniform mat4 u_matrix;
uniform vec2 u_viewport;

out vec4 v_color;

void main() {
  // Rotation matrix
  float c = cos(a_instanceRotation);
  float s = sin(a_instanceRotation);
  mat2 rot = mat2(c, -s, s, c);

  // Rotate local position
  vec2 rotated = rot * a_localPosition;

  // Scale to pixel size
  vec2 pixelOffset = rotated * a_instanceSize;

  // Transform instance position to clip space
  vec4 clipPos = u_matrix * vec4(a_instancePosition, 1.0);

  // Add pixel offset in clip space (convert pixels to clip units)
  vec2 offset = pixelOffset * 2.0 / u_viewport;

  gl_Position = vec4(clipPos.xy / clipPos.w + offset, clipPos.z / clipPos.w, 1.0);
  v_color = a_instanceColor;
}
`;

/**
 * Instanced point fragment shader.
 * Simply outputs the interpolated color.
 */
export const instancedPointFragmentShader = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;
