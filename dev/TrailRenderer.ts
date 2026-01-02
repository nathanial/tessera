/**
 * Instanced trail stamp renderer.
 */

import { createProgram } from "../src/shaders/compile";

const vertexShader = `#version 300 es
precision highp float;

in vec2 a_local;
in vec2 a_center;
in float a_size;
in float a_birth;
in vec4 a_color;

uniform mat3 u_matrix;

out vec2 v_local;
out float v_birth;
out vec4 v_color;

void main() {
  vec2 world = a_center + a_local * a_size;
  vec3 clip = u_matrix * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_local = a_local;
  v_birth = a_birth;
  v_color = a_color;
}
`;

const fragmentShader = `#version 300 es
precision mediump float;

in vec2 v_local;
in float v_birth;
in vec4 v_color;

uniform float u_time;
uniform float u_fadeDuration;

out vec4 fragColor;

void main() {
  float age = u_time - v_birth;
  if (age < 0.0 || age > u_fadeDuration) {
    discard;
  }

  float fade = 1.0 - age / u_fadeDuration;
  fade = fade * fade;
  float dist = length(v_local);
  float falloff = smoothstep(1.0, 0.0, dist);
  float alpha = v_color.a * fade * falloff;
  fragColor = vec4(v_color.rgb, alpha);
}
`;

const FLOAT_SIZE = 4;
const INSTANCE_STRIDE = 8;

export class TrailRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vertexBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private instanceBuffer: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount = 0;
  private instanceCapacity = 2048;
  private matrixUniform: WebGLUniformLocation;
  private timeUniform: WebGLUniformLocation;
  private fadeUniform: WebGLUniformLocation;
  private matrix: Float32Array | null = null;
  private timeSeconds = 0;
  private fadeDuration = 6;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertexShader, fragmentShader);
    this.matrixUniform = gl.getUniformLocation(this.program, "u_matrix")!;
    this.timeUniform = gl.getUniformLocation(this.program, "u_time")!;
    this.fadeUniform = gl.getUniformLocation(this.program, "u_fadeDuration")!;

    this.vao = gl.createVertexArray()!;
    this.vertexBuffer = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;
    this.instanceBuffer = gl.createBuffer()!;
    this.instanceData = new Float32Array(this.instanceCapacity * INSTANCE_STRIDE);

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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const aLocal = gl.getAttribLocation(this.program, "a_local");
    if (aLocal >= 0) {
      gl.enableVertexAttribArray(aLocal);
      gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, 2 * FLOAT_SIZE, 0);
    }

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);

    const strideBytes = INSTANCE_STRIDE * FLOAT_SIZE;
    this.bindInstanceAttrib("a_center", 2, strideBytes, 0);
    this.bindInstanceAttrib("a_size", 1, strideBytes, 8);
    this.bindInstanceAttrib("a_birth", 1, strideBytes, 12);
    this.bindInstanceAttrib("a_color", 4, strideBytes, 16);

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

  begin(matrix: Float32Array, timeSeconds: number, fadeDuration: number): void {
    this.instanceCount = 0;
    this.matrix = matrix;
    this.timeSeconds = timeSeconds;
    this.fadeDuration = Math.max(0.1, fadeDuration);
  }

  addStamp(
    centerX: number,
    centerY: number,
    size: number,
    birth: number,
    color: [number, number, number, number]
  ): void {
    if (this.instanceCount >= this.instanceCapacity) {
      this.grow();
    }
    const offset = this.instanceCount * INSTANCE_STRIDE;
    const data = this.instanceData;
    data[offset + 0] = centerX;
    data[offset + 1] = centerY;
    data[offset + 2] = size;
    data[offset + 3] = birth;
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
    gl.uniform1f(this.timeUniform, this.timeSeconds);
    gl.uniform1f(this.fadeUniform, this.fadeDuration);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const data = this.instanceData.subarray(0, this.instanceCount * INSTANCE_STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  private grow(): void {
    this.instanceCapacity *= 2;
    const next = new Float32Array(this.instanceCapacity * INSTANCE_STRIDE);
    next.set(this.instanceData);
    this.instanceData = next;
  }
}
