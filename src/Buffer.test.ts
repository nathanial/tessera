import { describe, it, expect, vi } from "vitest";
import { Buffer } from "./Buffer";

function createMockGL(): WebGL2RenderingContext {
  return {
    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    STREAM_DRAW: 0x88e0,
  } as unknown as WebGL2RenderingContext;
}

describe("Buffer", () => {
  describe("constructor", () => {
    it("creates an array buffer by default", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);

      expect(gl.createBuffer).toHaveBeenCalled();
      expect(buffer.target).toBe(gl.ARRAY_BUFFER);
      expect(buffer.usage).toBe(gl.STATIC_DRAW);
    });

    it("creates an element buffer when specified", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl, "element");

      expect(buffer.target).toBe(gl.ELEMENT_ARRAY_BUFFER);
    });

    it("sets dynamic usage when specified", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl, "array", "dynamic");

      expect(buffer.usage).toBe(gl.DYNAMIC_DRAW);
    });

    it("throws if buffer creation fails", () => {
      const gl = createMockGL();
      (gl.createBuffer as ReturnType<typeof vi.fn>).mockReturnValue(null);

      expect(() => new Buffer(gl)).toThrow("Failed to create WebGL buffer");
    });
  });

  describe("bind/unbind", () => {
    it("binds the buffer to its target", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);

      buffer.bind();

      expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, buffer.handle);
    });

    it("unbinds by setting null", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);

      buffer.unbind();

      expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, null);
    });

    it("throws when binding destroyed buffer", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);
      buffer.destroy();

      expect(() => buffer.bind()).toThrow("Cannot bind destroyed buffer");
    });
  });

  describe("setData", () => {
    it("uploads data to the buffer", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);
      const data = new Float32Array([1, 2, 3]);

      buffer.setData(data);

      expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, buffer.handle);
      expect(gl.bufferData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    });

    it("throws when setting data on destroyed buffer", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);
      buffer.destroy();

      expect(() => buffer.setData(new Float32Array([1]))).toThrow(
        "Cannot set data on destroyed buffer"
      );
    });
  });

  describe("updateData", () => {
    it("updates buffer data at offset", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);
      const data = new Float32Array([1, 2]);

      buffer.updateData(data, 8);

      expect(gl.bufferSubData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, 8, data);
    });

    it("defaults to offset 0", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);
      const data = new Float32Array([1]);

      buffer.updateData(data);

      expect(gl.bufferSubData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, 0, data);
    });
  });

  describe("destroy", () => {
    it("deletes the buffer", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);

      buffer.destroy();

      expect(gl.deleteBuffer).toHaveBeenCalledWith(buffer.handle);
      expect(buffer.destroyed).toBe(true);
    });

    it("is idempotent", () => {
      const gl = createMockGL();
      const buffer = new Buffer(gl);

      buffer.destroy();
      buffer.destroy();

      expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    });
  });
});
