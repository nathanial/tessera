/**
 * SDF Shaders
 *
 * Vertex and fragment shaders for Signed Distance Field text and icon rendering.
 * Provides crisp edges at any scale with smoothstep-based anti-aliasing.
 */

/**
 * SDF vertex shader.
 *
 * Transforms quad vertices and passes texture coordinates to fragment shader.
 *
 * Attributes:
 * - a_position: Vertex position in world coordinates
 * - a_texCoord: Texture coordinates for atlas lookup
 *
 * Uniforms:
 * - u_matrix: View-projection matrix (mat3)
 */
export const sdfVertexShader = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform mat3 u_matrix;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
}
`;

/**
 * SDF fragment shader.
 *
 * Renders SDF texture with smooth anti-aliased edges.
 * Supports optional halo/outline effect.
 *
 * Uniforms:
 * - u_atlasTexture: SDF atlas texture (sampler2D)
 * - u_color: Fill color (vec4)
 * - u_opacity: Overall opacity (float)
 * - u_sdfParams: [buffer, gamma, haloBuffer, haloGamma] (vec4)
 * - u_haloColor: Halo color (vec4)
 *
 * SDF convention:
 * - Values > 0.5 are inside the shape
 * - Values < 0.5 are outside the shape
 * - The edge is at exactly 0.5
 */
export const sdfFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_atlasTexture;
uniform vec4 u_color;
uniform float u_opacity;
uniform vec4 u_sdfParams;    // [buffer, gamma, haloBuffer, haloGamma]
uniform vec4 u_haloColor;

in vec2 v_texCoord;

out vec4 fragColor;

void main() {
  // Sample SDF value from atlas (stored in alpha channel)
  float dist = texture(u_atlasTexture, v_texCoord).a;

  // Extract SDF parameters
  float buffer = u_sdfParams.x;
  float gamma = u_sdfParams.y;
  float haloBuffer = u_sdfParams.z;
  float haloGamma = u_sdfParams.w;

  // Calculate anti-aliased alpha for main fill
  float alpha = smoothstep(buffer - gamma, buffer + gamma, dist);

  // Calculate halo if enabled (haloBuffer > 0)
  float haloAlpha = 0.0;
  if (haloBuffer > 0.0) {
    haloAlpha = smoothstep(haloBuffer - haloGamma, haloBuffer + haloGamma, dist);
    // Subtract the fill area from halo to get just the outline
    haloAlpha = haloAlpha * (1.0 - alpha);
  }

  // Composite: halo behind, fill in front
  vec3 color = u_color.rgb * alpha + u_haloColor.rgb * haloAlpha;
  float finalAlpha = (u_color.a * alpha + u_haloColor.a * haloAlpha) * u_opacity;

  fragColor = vec4(color, finalAlpha);

  // Discard fully transparent pixels for performance
  if (fragColor.a < 0.01) discard;
}
`;
