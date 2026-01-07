/**
 * Geometry wrapper combining VAO, vertex buffer, and optional index buffer
 */

import { Buffer, type BufferUsage } from "./Buffer";

// WebGL constants (avoid referencing WebGL2RenderingContext at module load time for testing)
const GL_FLOAT = 0x1406;
const GL_TRIANGLES = 0x0004;
const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;

export interface AttributeLayout {
  /** Attribute location in shader (0, 1, 2, etc.) */
  location: number;
  /** Number of components (1, 2, 3, or 4) */
  size: number;
  /** Data type (default: FLOAT) */
  type?: GLenum;
  /** Whether to normalize integer values (default: false) */
  normalized?: boolean;
  /** Byte stride between vertices (default: 0 = tightly packed) */
  stride?: number;
  /** Byte offset within vertex (default: 0) */
  offset?: number;
}

export interface GeometryOptions {
  /** Vertex data */
  vertices: Float32Array;
  /** Optional index data for indexed drawing */
  indices?: Uint16Array | Uint32Array;
  /** Vertex attribute layout */
  attributes: AttributeLayout[];
  /** Buffer usage hint (default: static) */
  usage?: BufferUsage;
}

export class Geometry {
  readonly gl: WebGL2RenderingContext;
  readonly vao: WebGLVertexArrayObject;
  readonly vertexBuffer: Buffer;
  readonly indexBuffer?: Buffer;
  readonly vertexCount: number;
  readonly indexCount?: number;
  readonly indexType?: GLenum;

  private _destroyed = false;

  constructor(gl: WebGL2RenderingContext, options: GeometryOptions) {
    this.gl = gl;

    // Create VAO
    const vao = gl.createVertexArray();
    if (!vao) {
      throw new Error("Failed to create VAO");
    }
    this.vao = vao;

    // Create and populate vertex buffer
    this.vertexBuffer = new Buffer(gl, "array", options.usage ?? "static");
    this.vertexBuffer.setData(options.vertices);

    // Calculate vertex count from first attribute
    const firstAttr = options.attributes[0];
    if (!firstAttr) {
      throw new Error("At least one attribute is required");
    }
    const bytesPerVertex = firstAttr.stride || (firstAttr.size * 4); // 4 bytes per float
    this.vertexCount = (options.vertices.byteLength / bytesPerVertex) | 0;


    // Create and populate index buffer if provided
    if (options.indices) {
      // Validate indices are within vertex count
      let maxIndex = 0;
      for (let i = 0; i < options.indices.length; i++) {
        const idx = options.indices[i]!;
        if (idx > maxIndex) maxIndex = idx;
      }
      if (maxIndex >= this.vertexCount) {
        // Log detailed error for debugging
        console.error(`[Geometry] Invalid indices: maxIndex=${maxIndex} >= vertexCount=${this.vertexCount}, indexCount=${options.indices.length}, vertexBytes=${options.vertices.byteLength}, stride=${bytesPerVertex}`);
        // Log first few bad indices
        for (let i = 0; i < Math.min(options.indices.length, 20); i++) {
          if (options.indices[i]! >= this.vertexCount) {
            console.error(`  index[${i}] = ${options.indices[i]} (invalid)`);
          }
        }
        // Throw to prevent creating invalid geometry - this helps identify the source
        throw new Error(`Invalid geometry: indices reference vertices beyond buffer (maxIndex=${maxIndex}, vertexCount=${this.vertexCount})`);
      }

      this.indexBuffer = new Buffer(gl, "element", options.usage ?? "static");
      this.indexBuffer.setData(options.indices);
      this.indexCount = options.indices.length;
      // Store the actual index type based on the array type passed in
      this.indexType = options.indices instanceof Uint32Array ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
    }

    // Setup VAO
    gl.bindVertexArray(this.vao);
    this.vertexBuffer.bind();

    for (const attr of options.attributes) {
      gl.enableVertexAttribArray(attr.location);
      gl.vertexAttribPointer(
        attr.location,
        attr.size,
        attr.type ?? GL_FLOAT,
        attr.normalized ?? false,
        attr.stride ?? 0,
        attr.offset ?? 0
      );
    }

    if (this.indexBuffer) {
      this.indexBuffer.bind();
    }

    gl.bindVertexArray(null);
  }

  /** Bind the VAO for rendering */
  bind(): void {
    if (this._destroyed) {
      throw new Error("Cannot bind destroyed geometry");
    }
    this.gl.bindVertexArray(this.vao);
  }

  /** Unbind the VAO */
  unbind(): void {
    this.gl.bindVertexArray(null);
  }

  /** Draw the geometry */
  draw(mode: GLenum = GL_TRIANGLES): void {
    if (this._destroyed) {
      throw new Error("Cannot draw destroyed geometry");
    }

    this.bind();

    if (this.indexBuffer && this.indexCount !== undefined && this.indexType !== undefined) {
      this.gl.drawElements(mode, this.indexCount, this.indexType, 0);
    } else {
      this.gl.drawArrays(mode, 0, this.vertexCount);
    }
  }

  /** Delete all buffers and the VAO */
  destroy(): void {
    if (this._destroyed) return;

    this.vertexBuffer.destroy();
    this.indexBuffer?.destroy();
    this.gl.deleteVertexArray(this.vao);

    this._destroyed = true;
  }

  /** Check if geometry has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Create a unit quad (0,0) to (1,1) suitable for tile rendering
   * Uses attribute location 0 for position (vec2)
   */
  static createQuad(gl: WebGL2RenderingContext): Geometry {
    const vertices = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);

    return new Geometry(gl, {
      vertices,
      attributes: [
        { location: 0, size: 2 }, // a_position: vec2
      ],
    });
  }
}
