/**
 * Dynamic GPU buffer for immediate mode rendering
 *
 * Accumulates vertex/index data on the CPU, then uploads to GPU when flushed.
 * Automatically grows internal arrays as needed.
 */

const GL_ARRAY_BUFFER = 0x8892;
const GL_ELEMENT_ARRAY_BUFFER = 0x8893;
const GL_DYNAMIC_DRAW = 0x88e8;

export type DynamicBufferType = "vertex" | "index";

export class DynamicBuffer {
  readonly gl: WebGL2RenderingContext;
  readonly handle: WebGLBuffer;
  readonly target: GLenum;

  private data: Float32Array | Uint16Array | Uint32Array;
  private capacity: number;
  private length: number = 0;
  private gpuCapacity: number = 0;
  private destroyed = false;

  private readonly isIndex: boolean;
  private useUint32: boolean = false;

  constructor(
    gl: WebGL2RenderingContext,
    type: DynamicBufferType,
    initialCapacity: number = 1024
  ) {
    this.gl = gl;
    this.isIndex = type === "index";
    this.target = this.isIndex ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER;
    this.capacity = initialCapacity;

    // Vertex buffers always use Float32, index buffers start with Uint16
    this.data = this.isIndex
      ? new Uint16Array(initialCapacity)
      : new Float32Array(initialCapacity);

    const handle = gl.createBuffer();
    if (!handle) {
      throw new Error("Failed to create WebGL buffer");
    }
    this.handle = handle;
  }

  /**
   * Current number of elements in the buffer
   */
  get count(): number {
    return this.length;
  }

  /**
   * Whether this is an index buffer using 32-bit indices
   */
  get isUint32(): boolean {
    return this.useUint32;
  }

  /**
   * Reset the buffer for a new frame (keeps GPU allocation)
   */
  reset(): void {
    this.length = 0;
  }

  /**
   * Push a single value
   */
  push(value: number): void {
    this.ensureCapacity(this.length + 1);
    this.data[this.length++] = value;
  }

  /**
   * Push multiple values
   */
  pushArray(values: number[] | Float32Array | Uint16Array | Uint32Array): void {
    const len = values.length;
    this.ensureCapacity(this.length + len);
    for (let i = 0; i < len; i++) {
      this.data[this.length++] = values[i]!;
    }
  }

  /**
   * Push values with an offset (useful for merging index buffers)
   */
  pushArrayWithOffset(
    values: number[] | Uint16Array | Uint32Array,
    offset: number
  ): void {
    const len = values.length;
    this.ensureCapacity(this.length + len);

    // Check if we need to upgrade to Uint32
    if (this.isIndex && !this.useUint32) {
      for (let i = 0; i < len; i++) {
        if (values[i]! + offset > 65535) {
          this.upgradeToUint32();
          break;
        }
      }
    }

    for (let i = 0; i < len; i++) {
      this.data[this.length++] = values[i]! + offset;
    }
  }

  /**
   * Bind this buffer
   */
  bind(): void {
    if (this.destroyed) {
      throw new Error("Cannot bind destroyed buffer");
    }
    this.gl.bindBuffer(this.target, this.handle);
  }

  /**
   * Upload accumulated data to GPU
   */
  upload(): void {
    if (this.length === 0) return;

    this.bind();

    // Get the portion of data we're using
    const activeData = this.data.subarray(0, this.length);

    if (this.length > this.gpuCapacity) {
      // Need to reallocate GPU buffer
      this.gl.bufferData(this.target, activeData, GL_DYNAMIC_DRAW);
      this.gpuCapacity = this.length;
    } else {
      // Can update existing buffer
      this.gl.bufferSubData(this.target, 0, activeData);
    }
  }

  /**
   * Ensure we have enough capacity
   */
  private ensureCapacity(needed: number): void {
    if (needed <= this.capacity) return;

    // Grow by 2x
    const newCapacity = Math.max(needed, this.capacity * 2);
    const newData = this.isIndex
      ? this.useUint32
        ? new Uint32Array(newCapacity)
        : new Uint16Array(newCapacity)
      : new Float32Array(newCapacity);

    // Copy existing data
    newData.set(this.data.subarray(0, this.length));
    this.data = newData;
    this.capacity = newCapacity;
  }

  /**
   * Upgrade index buffer from Uint16 to Uint32
   */
  private upgradeToUint32(): void {
    if (!this.isIndex || this.useUint32) return;

    const newData = new Uint32Array(this.capacity);
    newData.set(this.data.subarray(0, this.length));
    this.data = newData;
    this.useUint32 = true;
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.gl.deleteBuffer(this.handle);
    this.destroyed = true;
  }
}
