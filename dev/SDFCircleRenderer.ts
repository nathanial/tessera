/**
 * Instanced SDF circle renderer (screen-space sized).
 */

import { createProgram } from "../src/shaders/compile";

const vertexShader = `#version 300 es
precision highp float;

in vec2 a_local;
in vec2 a_center;
in float a_radius;
in float a_feather;
in vec4 a_color;

uniform mat3 u_matrix;
uniform vec2 u_viewport;

out vec2 v_local;
out float v_radius;
out float v_feather;
out vec4 v_color;

void main() {
  vec3 clip = u_matrix * vec3(a_center, 1.0);
  vec2 offset = a_local * a_radius * 2.0 / u_viewport;
  gl_Position = vec4(clip.xy + offset, 0.0, 1.0);
  v_local = a_local;
  v_radius = a_radius;
  v_feather = a_feather;
  v_color = a_color;
}
`;

const fragmentShader = `#version 300 es
precision highp float;

in vec2 v_local;
in float v_radius;
in float v_feather;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float sd = length(v_local) - 1.0;
  float aa = fwidth(sd);
  float alpha = smoothstep(0.0, aa, -sd);
  if (alpha <= 0.0) {
    discard;
  }
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

const FLOAT_SIZE = 4;
const STRIDE = 8;

export class SDFCircleRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instanceVbo: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount = 0;
  private instanceCapacity = 4096;
  private matrixUniform: WebGLUniformLocation;
  private viewportUniform: WebGLUniformLocation;
  private matrix: Float32Array | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertexShader, fragmentShader);
    this.matrixUniform = gl.getUniformLocation(this.program, "u_matrix")!;
    this.viewportUniform = gl.getUniformLocation(this.program, "u_viewport")!;
    this.vao = gl.createVertexArray()!;
    this.quadVbo = gl.createBuffer()!;
    this.instanceVbo = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;
    this.instanceData = new Float32Array(this.instanceCapacity * STRIDE);
    this.setupBuffers();
  }

  private setupBuffers(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      1, 1,
      -1, 1,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const aLocal = gl.getAttribLocation(this.program, "a_local");
    if (aLocal >= 0) {
      gl.enableVertexAttribArray(aLocal);
      gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, 2 * FLOAT_SIZE, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);

    const strideBytes = STRIDE * FLOAT_SIZE;
    this.bindInstanceAttrib("a_center", 2, strideBytes, 0);
    this.bindInstanceAttrib("a_radius", 1, strideBytes, 8);
    this.bindInstanceAttrib("a_feather", 1, strideBytes, 12);
    this.bindInstanceAttrib("a_color", 4, strideBytes, 16);

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  private bindInstanceAttrib(
    name: string,
    size: number,
    stride: number,
    offset: number
  ): void {
    const gl = this.gl;
    const location = gl.getAttribLocation(this.program, name);
    if (location < 0) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(location, 1);
  }

  begin(matrix: Float32Array, viewportWidth: number, viewportHeight: number): void {
    this.instanceCount = 0;
    this.matrix = matrix;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  addCircle(
    centerX: number,
    centerY: number,
    radiusPx: number,
    featherPx: number,
    color: [number, number, number, number]
  ): void {
    if (this.instanceCount >= this.instanceCapacity) {
      this.grow();
    }
    const offset = this.instanceCount * STRIDE;
    const data = this.instanceData;
    data[offset + 0] = centerX;
    data[offset + 1] = centerY;
    data[offset + 2] = radiusPx;
    data[offset + 3] = featherPx;
    data[offset + 4] = color[0];
    data[offset + 5] = color[1];
    data[offset + 6] = color[2];
    data[offset + 7] = color[3];
    this.instanceCount++;
  }

  render(): void {
    if (this.instanceCount === 0 || !this.matrix) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.matrixUniform, false, this.matrix);
    gl.uniform2f(this.viewportUniform, this.viewportWidth, this.viewportHeight);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    const data = this.instanceData.subarray(0, this.instanceCount * STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  private grow(): void {
    this.instanceCapacity *= 2;
    const next = new Float32Array(this.instanceCapacity * STRIDE);
    next.set(this.instanceData);
    this.instanceData = next;
  }
}
