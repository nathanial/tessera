/**
 * Atlas texture management for SDF rendering.
 * Handles loading font and icon atlas textures.
 */

import type { FontAtlasMetadata, IconAtlasMetadata } from "./types";

export interface FontAtlas {
  metadata: FontAtlasMetadata;
  texture: WebGLTexture;
}

export interface IconAtlas {
  metadata: IconAtlasMetadata;
  texture: WebGLTexture;
}

/**
 * Create an atlas texture from an image.
 */
export function createAtlasTexture(
  gl: WebGL2RenderingContext,
  image: HTMLImageElement
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create atlas texture");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Generate mipmaps for better quality at smaller sizes
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Use trilinear filtering with mipmaps for smooth scaling
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}
