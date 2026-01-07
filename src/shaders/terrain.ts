/**
 * Terrain rendering shaders for 3D terrain visualization
 */

export const terrainVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;   // x, y, z (world coords with height)
layout(location = 1) in vec2 a_texCoord;   // UV for raster tile sampling

uniform mat4 u_viewProjection;  // Camera view-projection matrix

out vec2 v_texCoord;
out float v_height;   // Pass height for optional shading

void main() {
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
  v_texCoord = a_texCoord;
  v_height = a_position.z;
}
`;

export const terrainFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_texture;     // Raster tile texture
uniform vec2 u_uvOffset;         // UV offset for fallback tile sampling
uniform float u_uvScale;         // UV scale for fallback tile sampling
uniform float u_minHeight;       // Minimum terrain height (for shading)
uniform float u_maxHeight;       // Maximum terrain height (for shading)

in vec2 v_texCoord;
in float v_height;

out vec4 fragColor;

void main() {
  vec2 uv = u_uvOffset + v_texCoord * u_uvScale;
  vec4 texColor = texture(u_texture, uv);

  // Optional height-based shading
  float heightRange = u_maxHeight - u_minHeight;
  float heightNorm = heightRange > 0.0 ? (v_height - u_minHeight) / heightRange : 0.5;

  // Slight darkening at lower elevations, brightening at higher
  float shade = 0.85 + 0.3 * heightNorm;

  fragColor = vec4(texColor.rgb * shade, texColor.a);
}
`;

/** Wireframe terrain shader for debugging */
export const terrainWireframeFragmentShader = `#version 300 es
precision mediump float;

in vec2 v_texCoord;
in float v_height;

out vec4 fragColor;

void main() {
  // Height-based color (blue = low, green = high)
  float h = clamp(v_height * 5000.0, 0.0, 1.0);
  fragColor = vec4(0.2, 0.3 + h * 0.5, 0.8 - h * 0.3, 1.0);
}
`;

/** Simple terrain shader without texture (for debugging) */
export const terrainDebugFragmentShader = `#version 300 es
precision mediump float;

in vec2 v_texCoord;
in float v_height;

out vec4 fragColor;

void main() {
  // Height-based grayscale
  float h = clamp(v_height * 2000.0, 0.0, 1.0);
  fragColor = vec4(h * 0.8, h * 0.9, h * 0.7, 1.0);
}
`;
