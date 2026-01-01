/**
 * Blend Mode Implementation
 *
 * WebGL blend function configurations for different compositing modes.
 */

import type { BlendMode } from "./types";

/**
 * Set the WebGL blend mode.
 *
 * @param gl - WebGL2 rendering context
 * @param mode - Blend mode to apply
 */
export function setBlendMode(
  gl: WebGL2RenderingContext,
  mode: BlendMode
): void {
  switch (mode) {
    case "normal":
      // Standard alpha blending: src * srcAlpha + dst * (1 - srcAlpha)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      break;

    case "add":
      // Additive blending: src * srcAlpha + dst * 1
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      break;

    case "multiply":
      // Multiply blending: RGB = dst * src, Alpha = standard
      gl.blendFuncSeparate(
        gl.DST_COLOR,
        gl.ZERO, // RGB: dst * src
        gl.DST_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA // Alpha: standard
      );
      break;

    case "screen":
      // Screen blending: 1 - (1-dst)(1-src)
      gl.blendFuncSeparate(
        gl.ONE,
        gl.ONE_MINUS_SRC_COLOR, // RGB: 1 - (1-dst)(1-src)
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA // Alpha
      );
      break;
  }
}
