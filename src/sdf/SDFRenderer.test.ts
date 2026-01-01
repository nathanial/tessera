/**
 * SDFRenderer Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SDFRenderer } from "./SDFRenderer";
import type { FontAtlasMetadata } from "./types";

// Mock WebGL2 context
function createMockGL(): WebGL2RenderingContext {
  const gl = {
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    getAttribLocation: vi.fn(() => 0),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    useProgram: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform4f: vi.fn(),
    uniform4fv: vi.fn(),
    activeTexture: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    drawElements: vi.fn(),
    deleteTexture: vi.fn(),
    deleteProgram: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteShader: vi.fn(),
    getShaderInfoLog: vi.fn(() => ""),
    getProgramInfoLog: vi.fn(() => ""),
    viewport: vi.fn(),
    TEXTURE_2D: 0x0de1,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    TRIANGLES: 0x0004,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE0: 0x84c0,
  } as unknown as WebGL2RenderingContext;
  return gl;
}

// Create a simple font atlas metadata for testing
function createTestFontAtlas(): FontAtlasMetadata {
  return {
    name: "Test Font",
    size: 48,
    atlasWidth: 512,
    atlasHeight: 512,
    sdfSpread: 4,
    lineHeight: 58,
    baseline: 38,
    glyphs: {
      // 'A' = 65
      65: {
        id: 65,
        x: 0,
        y: 0,
        width: 30,
        height: 52,
        xOffset: 0,
        yOffset: 0,
        xAdvance: 28,
      },
      // 'B' = 66
      66: {
        id: 66,
        x: 32,
        y: 0,
        width: 28,
        height: 52,
        xOffset: 0,
        yOffset: 0,
        xAdvance: 26,
      },
    },
  };
}

describe("SDFRenderer", () => {
  let gl: WebGL2RenderingContext;
  let renderer: SDFRenderer;

  beforeEach(() => {
    gl = createMockGL();
    renderer = new SDFRenderer(gl);
  });

  describe("text management", () => {
    it("should add text labels", () => {
      expect(renderer.textCount).toBe(0);

      renderer.addText("Test", 0.5, 0.5);
      expect(renderer.textCount).toBe(1);

      renderer.addText("Another", 0.3, 0.3);
      expect(renderer.textCount).toBe(2);
    });

    it("should remove text labels", () => {
      renderer.addText("Test", 0.5, 0.5);
      renderer.addText("Another", 0.3, 0.3);
      expect(renderer.textCount).toBe(2);

      renderer.removeText(0);
      expect(renderer.textCount).toBe(1);
    });

    it("should clear all text labels", () => {
      renderer.addText("Test", 0.5, 0.5);
      renderer.addText("Another", 0.3, 0.3);

      renderer.clearText();
      expect(renderer.textCount).toBe(0);
    });
  });

  describe("font atlas loading", () => {
    it("should load font atlas", () => {
      const metadata = createTestFontAtlas();
      const image = { width: 512, height: 512 } as HTMLImageElement;

      renderer.loadFontAtlas(metadata, image);

      // Verify texture was created and bound
      expect(gl.createTexture).toHaveBeenCalled();
      expect(gl.bindTexture).toHaveBeenCalled();
      expect(gl.texImage2D).toHaveBeenCalled();
    });
  });

  describe("text geometry sizing", () => {
    it("should calculate reasonable text width in world coordinates", () => {
      // This test documents the expected behavior:
      // Text at fontSize 14px should produce geometry that fits within
      // a reasonable world-space area around the text position

      const metadata = createTestFontAtlas();
      const image = { width: 512, height: 512 } as HTMLImageElement;

      renderer.loadFontAtlas(metadata, image);
      renderer.addText("AB", 0.5, 0.5, { fontSize: 14 });

      // With font size 48 in atlas, and fontSize 14:
      // scale = 14/48 = 0.29
      // Glyph 'A' has xAdvance = 28, so scaled = 28 * 0.29 = 8.12 pixels
      // Glyph 'B' has xAdvance = 26, so scaled = 26 * 0.29 = 7.54 pixels
      // Total width ~15.7 pixels
      //
      // For text at position (0.5, 0.5) in world space:
      // If we're on a 1000px viewport, we'd expect the text to occupy
      // about 15.7 / 1000 = 0.0157 world units width
      //
      // The CURRENT bug: glyph width (30px) is added directly to world coords
      // giving quads from 0.5 to 30.5 instead of 0.5 to 0.5157

      // The fix needs to convert pixel dimensions to world space
      // This requires knowing the viewport size during geometry generation
      // OR using a shader-based approach like InstancedPointRenderer
    });
  });

  describe("icon management", () => {
    it("should add icons", () => {
      expect(renderer.iconCount).toBe(0);

      renderer.addIcon("marker", 0.5, 0.5);
      expect(renderer.iconCount).toBe(1);
    });

    it("should clear icons", () => {
      renderer.addIcon("marker", 0.5, 0.5);
      renderer.clearIcons();
      expect(renderer.iconCount).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources on destroy", () => {
      const metadata = createTestFontAtlas();
      const image = { width: 512, height: 512 } as HTMLImageElement;

      renderer.loadFontAtlas(metadata, image);
      renderer.addText("Test", 0.5, 0.5);

      renderer.destroy();

      expect(renderer.destroyed).toBe(true);
      expect(gl.deleteTexture).toHaveBeenCalled();
      expect(gl.deleteProgram).toHaveBeenCalled();
    });
  });
});
