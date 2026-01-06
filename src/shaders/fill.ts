/**
 * Polygon fill shaders (3D with terrain support)
 */

export const fillVertexShader = `#version 300 es
precision highp float;

in vec3 a_position;  // x, y, z (z from terrain height)

uniform mat4 u_matrix;

void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
}
`;

export const fillFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;
