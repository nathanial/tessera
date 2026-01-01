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
 * Uses a two-part position: anchor in world space + offset in pixels.
 *
 * Attributes:
 * - a_anchor: Anchor position in world coordinates
 * - a_offset: Pixel offset from anchor
 * - a_texCoord: Texture coordinates for atlas lookup
 *
 * Uniforms:
 * - u_matrix: View-projection matrix (mat3)
 * - u_viewportWidth: Viewport width in pixels
 * - u_viewportHeight: Viewport height in pixels
 */
export const sdfVertexShader = `#version 300 es
precision highp float;

in vec2 a_anchor;
in vec2 a_offset;
in vec2 a_texCoord;

uniform mat3 u_matrix;
uniform float u_viewportWidth;
uniform float u_viewportHeight;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;

  // Transform anchor to clip space
  vec3 anchorClip = u_matrix * vec3(a_anchor, 1.0);

  // Convert pixel offset to clip space (2.0 because clip space is -1 to 1)
  vec2 offsetClip = a_offset * vec2(2.0 / u_viewportWidth, -2.0 / u_viewportHeight);

  gl_Position = vec4(anchorClip.xy + offsetClip, 0.0, 1.0);
}
`;

/**
 * SDF fragment shader.
 *
 * Renders SDF texture with smooth anti-aliased edges.
 * Also works with regular alpha textures (canvas-generated fonts).
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
 *
 * For canvas-generated fonts (gamma >= 0.5), uses direct alpha sampling.
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
  // Sample from atlas
  vec4 texColor = texture(u_atlasTexture, v_texCoord);
  float dist = texColor.a;

  // Extract SDF parameters
  float buffer = u_sdfParams.x;
  float gamma = u_sdfParams.y;
  float haloBuffer = u_sdfParams.z;
  float haloGamma = u_sdfParams.w;

  float alpha;
  float haloAlpha = 0.0;

  // If gamma is high (>= 0.4), treat as regular alpha texture (canvas-generated)
  if (gamma >= 0.4) {
    // Direct alpha sampling for canvas-generated fonts
    alpha = dist;

    // Simple outline for canvas fonts
    if (haloBuffer > 0.0) {
      haloAlpha = smoothstep(0.0, 0.3, dist) * (1.0 - smoothstep(0.3, 0.7, dist));
    }
  } else {
    // True SDF rendering
    alpha = smoothstep(buffer - gamma, buffer + gamma, dist);

    // Calculate halo if enabled
    if (haloBuffer > 0.0) {
      haloAlpha = smoothstep(haloBuffer - haloGamma, haloBuffer + haloGamma, dist);
      haloAlpha = haloAlpha * (1.0 - alpha);
    }
  }

  // Composite: halo behind, fill in front
  vec3 color = u_color.rgb * alpha + u_haloColor.rgb * haloAlpha;
  float finalAlpha = (u_color.a * alpha + u_haloColor.a * haloAlpha) * u_opacity;

  fragColor = vec4(color, finalAlpha);

  // Discard fully transparent pixels for performance
  if (fragColor.a < 0.01) discard;
}
`;
