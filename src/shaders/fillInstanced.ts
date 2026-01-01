/**
 * Instanced fill shaders
 *
 * Renders filled shapes using GPU instancing for better performance.
 * Instance data is stored in a texture for efficient batching.
 * Each instance has: position, size, rotation, and color.
 */

export const fillInstancedVertexShader = `#version 300 es
precision highp float;

// Per-vertex attributes (from template geometry)
in vec2 a_localPosition;

// Instance data texture: each instance = 2 texels (8 floats)
// Texel 0: position.x, position.y, size, rotation
// Texel 1: color.r, color.g, color.b, color.a
// 2D layout: TEXTURE_WIDTH texels per row
uniform sampler2D u_instanceData;
uniform int u_baseInstance;
uniform int u_textureWidth;
uniform mat3 u_matrix;

out vec4 v_color;

void main() {
  // Read instance data from 2D texture
  int instanceId = gl_InstanceID + u_baseInstance;
  int texelIndex0 = instanceId * 2;
  int texelIndex1 = texelIndex0 + 1;

  ivec2 coord0 = ivec2(texelIndex0 % u_textureWidth, texelIndex0 / u_textureWidth);
  ivec2 coord1 = ivec2(texelIndex1 % u_textureWidth, texelIndex1 / u_textureWidth);

  vec4 data0 = texelFetch(u_instanceData, coord0, 0);
  vec4 data1 = texelFetch(u_instanceData, coord1, 0);

  vec2 instancePosition = data0.xy;
  float instanceSize = data0.z;
  float instanceRotation = data0.w;
  vec4 instanceColor = data1;

  // Rotate template vertex
  float c = cos(instanceRotation);
  float s = sin(instanceRotation);
  vec2 rotated = vec2(
    a_localPosition.x * c - a_localPosition.y * s,
    a_localPosition.x * s + a_localPosition.y * c
  );

  // Scale and translate to world position
  vec2 worldPos = instancePosition + rotated * instanceSize;

  // Apply view-projection matrix
  vec3 clipPos = u_matrix * vec3(worldPos, 1.0);
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);

  v_color = instanceColor;
}
`;

export const fillInstancedFragmentShader = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;
