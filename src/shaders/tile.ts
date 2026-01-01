/**
 * Tile rendering shaders
 */

export const tileVertexShader = `#version 300 es
in vec2 a_position;

uniform mat3 u_matrix;
uniform vec2 u_tileOffset;
uniform float u_tileScale;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_position;
  vec2 world = (a_position + u_tileOffset) * u_tileScale;
  vec3 pos = u_matrix * vec3(world, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}
`;

export const tileFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_uvOffset;   // UV offset for fallback tile sampling (0,0 for exact tile)
uniform float u_uvScale;   // UV scale for fallback tile sampling (1.0 for exact tile)

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  // Apply UV transform for fallback tiles
  vec2 uv = u_uvOffset + v_texCoord * u_uvScale;
  vec4 texColor = texture(u_texture, uv);
  fragColor = texColor;
}
`;

// Debug shader that ignores textures - shows gradient based on position
export const debugFragmentShader = `#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = vec4(v_texCoord.x, v_texCoord.y, 0.5, 1.0);
}
`;
