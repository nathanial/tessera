/**
 * Polyline stroke shaders with screen-space width
 *
 * Vertex attributes:
 * - a_position: Base line position in world coordinates
 * - a_normal: Extrusion direction (normalized)
 * - a_side: Miter scale (+/- value, positive for left, negative for right)
 *
 * Uniforms:
 * - u_matrix: View-projection matrix (mat3)
 * - u_halfWidth: Half line width in pixels
 * - u_viewport: Viewport size in pixels (vec2)
 */

export const strokeVertexShader = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_normal;
in float a_side;

uniform mat3 u_matrix;
uniform float u_halfWidth;
uniform vec2 u_viewport;

void main() {
  // Transform base position to clip space
  vec3 clipPos = u_matrix * vec3(a_position, 1.0);

  // Transform normal direction (without translation)
  vec3 clipNormal = u_matrix * vec3(a_normal, 0.0);

  // Normalize the normal in clip space
  vec2 screenNormal = normalize(clipNormal.xy);

  // Compute offset in clip space
  // a_side contains the miter scale (positive = left, negative = right)
  // Convert pixel width to clip space units (clip space is -1 to 1, so multiply by 2)
  vec2 offset = screenNormal * a_side * u_halfWidth * 2.0 / u_viewport;

  gl_Position = vec4(clipPos.xy + offset, 0.0, 1.0);
}
`;

export const strokeFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;
