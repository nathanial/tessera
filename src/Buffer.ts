/**
 * WebGL Buffer wrapper with lifecycle management
 */

export type BufferTarget = "array" | "element";
export type BufferUsage = "static" | "dynamic" | "stream";

// WebGL constants (avoid referencing WebGL2RenderingContext at module load time for testing)
const GL_ARRAY_BUFFER = 0x8892;
const GL_ELEMENT_ARRAY_BUFFER = 0x8893;
const GL_STATIC_DRAW = 0x88e4;
const GL_DYNAMIC_DRAW = 0x88e8;
const GL_STREAM_DRAW = 0x88e0;

const TARGET_MAP: Record<BufferTarget, GLenum> = {
  array: GL_ARRAY_BUFFER,
  element: GL_ELEMENT_ARRAY_BUFFER,
};

const USAGE_MAP: Record<BufferUsage, GLenum> = {
  static: GL_STATIC_DRAW,
  dynamic: GL_DYNAMIC_DRAW,
  stream: GL_STREAM_DRAW,
};

export class Buffer {
  readonly gl: WebGL2RenderingContext;
  readonly handle: WebGLBuffer;
  readonly target: GLenum;
  readonly usage: GLenum;

  private _destroyed = false;

  constructor(
    gl: WebGL2RenderingContext,
    target: BufferTarget = "array",
    usage: BufferUsage = "static"
  ) {
    this.gl = gl;
    this.target = TARGET_MAP[target];
    this.usage = USAGE_MAP[usage];

    const handle = gl.createBuffer();
    if (!handle) {
      throw new Error("Failed to create WebGL buffer");
    }
    this.handle = handle;
  }

  /** Bind this buffer to its target */
  bind(): void {
    if (this._destroyed) {
      throw new Error("Cannot bind destroyed buffer");
    }
    this.gl.bindBuffer(this.target, this.handle);
  }

  /** Unbind this buffer's target */
  unbind(): void {
    this.gl.bindBuffer(this.target, null);
  }

  /** Upload data to the buffer (replaces existing data) */
  setData(data: AllowSharedBufferSource): void {
    if (this._destroyed) {
      throw new Error("Cannot set data on destroyed buffer");
    }
    this.bind();
    this.gl.bufferData(this.target, data, this.usage);
  }

  /** Update a portion of the buffer's data */
  updateData(data: AllowSharedBufferSource, offset: number = 0): void {
    if (this._destroyed) {
      throw new Error("Cannot update data on destroyed buffer");
    }
    this.bind();
    this.gl.bufferSubData(this.target, offset, data);
  }

  /** Delete the buffer and release GPU memory */
  destroy(): void {
    if (this._destroyed) return;
    this.gl.deleteBuffer(this.handle);
    this._destroyed = true;
  }

  /** Check if buffer has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }
}
