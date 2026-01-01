import { describe, it, expect, vi } from "vitest";
import { Geometry } from "./Geometry";

function createMockGL(): WebGL2RenderingContext {
  return {
    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    drawElements: vi.fn(),
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
  } as unknown as WebGL2RenderingContext;
}

describe("Geometry", () => {
  describe("constructor", () => {
    it("creates VAO and vertex buffer", () => {
      const gl = createMockGL();
      const vertices = new Float32Array([0, 0, 1, 0, 0, 1]);

      const geo = new Geometry(gl, {
        vertices,
        attributes: [{ location: 0, size: 2 }],
      });

      expect(gl.createVertexArray).toHaveBeenCalled();
      expect(gl.createBuffer).toHaveBeenCalled();
      expect(geo.vertexCount).toBe(3); // 6 floats / 2 components = 3 vertices
    });

    it("creates index buffer when indices provided", () => {
      const gl = createMockGL();

      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        indices: new Uint16Array([0, 1, 2, 2, 1, 3]),
        attributes: [{ location: 0, size: 2 }],
      });

      expect(gl.createBuffer).toHaveBeenCalledTimes(2); // vertex + index
      expect(geo.indexCount).toBe(6);
    });

    it("sets up vertex attributes", () => {
      const gl = createMockGL();

      new Geometry(gl, {
        vertices: new Float32Array([0, 0, 1, 0, 0, 1]),
        attributes: [
          { location: 0, size: 2, stride: 8, offset: 0 },
        ],
      });

      expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(0);
      expect(gl.vertexAttribPointer).toHaveBeenCalledWith(
        0, 2, gl.FLOAT, false, 8, 0
      );
    });

    it("throws if no attributes provided", () => {
      const gl = createMockGL();

      expect(() => new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [],
      })).toThrow("At least one attribute is required");
    });

    it("throws if VAO creation fails", () => {
      const gl = createMockGL();
      (gl.createVertexArray as ReturnType<typeof vi.fn>).mockReturnValue(null);

      expect(() => new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [{ location: 0, size: 2 }],
      })).toThrow("Failed to create VAO");
    });
  });

  describe("bind/unbind", () => {
    it("binds the VAO", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.bind();

      expect(gl.bindVertexArray).toHaveBeenCalledWith(geo.vao);
    });

    it("unbinds by setting null", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.unbind();

      expect(gl.bindVertexArray).toHaveBeenCalledWith(null);
    });
  });

  describe("draw", () => {
    it("draws arrays without indices", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0, 1, 0, 0, 1]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.draw();

      expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
    });

    it("draws elements with indices", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        indices: new Uint16Array([0, 1, 2]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.draw();

      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0
      );
    });

    it("throws when drawing destroyed geometry", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [{ location: 0, size: 2 }],
      });
      geo.destroy();

      expect(() => geo.draw()).toThrow("Cannot draw destroyed geometry");
    });
  });

  describe("destroy", () => {
    it("deletes VAO and buffers", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        indices: new Uint16Array([0]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.destroy();

      expect(gl.deleteVertexArray).toHaveBeenCalledWith(geo.vao);
      expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
      expect(geo.destroyed).toBe(true);
    });

    it("is idempotent", () => {
      const gl = createMockGL();
      const geo = new Geometry(gl, {
        vertices: new Float32Array([0, 0]),
        attributes: [{ location: 0, size: 2 }],
      });

      geo.destroy();
      geo.destroy();

      expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    });
  });

  describe("createQuad", () => {
    it("creates a unit quad geometry", () => {
      const gl = createMockGL();
      const quad = Geometry.createQuad(gl);

      expect(quad.vertexCount).toBe(6); // 2 triangles
      expect(quad.indexBuffer).toBeUndefined();
    });
  });
});
