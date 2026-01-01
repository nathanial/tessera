/**
 * Polygon fill shaders
 */

export const fillVertexShader = `#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_matrix;

void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
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
