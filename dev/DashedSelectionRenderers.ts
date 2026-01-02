/**
 * Instanced dashed line and ring renderers (screen-space).
 */

import { createProgram } from "../src/shaders/compile";

const lineVertexShader = `#version 300 es
precision highp float;

in vec2 a_local;
in vec2 a_start;
in vec2 a_end;
in float a_width;
in float a_dash;
in float a_gap;
in float a_phase;
in vec4 a_color;

uniform vec2 u_viewport;

out float v_pos;
out float v_dash;
out float v_gap;
out vec4 v_color;

void main() {
  vec2 dir = a_end - a_start;
  float len = length(dir);
  vec2 dirN = len > 0.0 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dirN.y, dirN.x);

  vec2 pos = a_start + dirN * (a_local.x * len) + normal * (a_local.y * a_width);
  vec2 clip = vec2(
    pos.x / u_viewport.x * 2.0 - 1.0,
    1.0 - pos.y / u_viewport.y * 2.0
  );

  gl_Position = vec4(clip, 0.0, 1.0);
  v_pos = a_local.x * len + a_phase;
  v_dash = a_dash;
  v_gap = a_gap;
  v_color = a_color;
}
`;

const lineFragmentShader = `#version 300 es
precision mediump float;

in float v_pos;
in float v_dash;
in float v_gap;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float cycle = v_dash + v_gap;
  if (cycle > 0.0) {
    float m = mod(v_pos, cycle);
    if (m > v_dash) {
      discard;
    }
  }
  fragColor = v_color;
}
`;

const ringVertexShader = `#version 300 es
precision highp float;

in vec2 a_local;
in vec2 a_center;
in float a_radius;
in float a_thickness;
in float a_dash;
in float a_gap;
in float a_phase;
in vec4 a_color;

uniform vec2 u_viewport;

out vec2 v_local;
out float v_radius;
out float v_thickness;
out float v_dash;
out float v_gap;
out float v_phase;
out vec4 v_color;

void main() {
  vec2 pos = a_center + a_local * a_radius;
  vec2 clip = vec2(
    pos.x / u_viewport.x * 2.0 - 1.0,
    1.0 - pos.y / u_viewport.y * 2.0
  );

  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_local * a_radius;
  v_radius = a_radius;
  v_thickness = a_thickness;
  v_dash = a_dash;
  v_gap = a_gap;
  v_phase = a_phase;
  v_color = a_color;
}
`;

const ringFragmentShader = `#version 300 es
precision mediump float;

in vec2 v_local;
in float v_radius;
in float v_thickness;
in float v_dash;
in float v_gap;
in float v_phase;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float dist = length(v_local);
  float halfThickness = v_thickness * 0.5;
  if (abs(dist - v_radius) > halfThickness) {
    discard;
  }

  float angle = atan(v_local.y, v_local.x);
  if (angle < 0.0) {
    angle += 6.28318530718;
  }
  float arc = angle * v_radius;
  float cycle = v_dash + v_gap;
  if (cycle > 0.0) {
    float m = mod(arc + v_phase, cycle);
    if (m > v_dash) {
      discard;
    }
  }

  fragColor = v_color;
}
`;

const FLOAT_SIZE = 4;
const LINE_STRIDE = 12;
const RING_STRIDE = 12;

export class DashedLineRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instanceVbo: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount = 0;
  private instanceCapacity = 256;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private viewportUniform: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, lineVertexShader, lineFragmentShader);
    this.viewportUniform = gl.getUniformLocation(this.program, "u_viewport")!;

    this.vao = gl.createVertexArray()!;
    this.quadVbo = gl.createBuffer()!;
    this.instanceVbo = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;

    this.instanceData = new Float32Array(this.instanceCapacity * LINE_STRIDE);
    this.setupBuffers();
  }

  private setupBuffers(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const quad = new Float32Array([
      0, -0.5,
      1, -0.5,
      1, 0.5,
      0, 0.5,
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

    const strideBytes = LINE_STRIDE * FLOAT_SIZE;
    this.bindInstanceAttrib("a_start", 2, strideBytes, 0);
    this.bindInstanceAttrib("a_end", 2, strideBytes, 8);
    this.bindInstanceAttrib("a_width", 1, strideBytes, 16);
    this.bindInstanceAttrib("a_dash", 1, strideBytes, 20);
    this.bindInstanceAttrib("a_gap", 1, strideBytes, 24);
    this.bindInstanceAttrib("a_phase", 1, strideBytes, 28);
    this.bindInstanceAttrib("a_color", 4, strideBytes, 32);

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

  begin(viewportWidth: number, viewportHeight: number): void {
    this.instanceCount = 0;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  addLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    width: number,
    dash: number,
    gap: number,
    phase: number,
    color: [number, number, number, number]
  ): void {
    if (this.instanceCount >= this.instanceCapacity) {
      this.grow();
    }
    const offset = this.instanceCount * LINE_STRIDE;
    const data = this.instanceData;
    data[offset + 0] = startX;
    data[offset + 1] = startY;
    data[offset + 2] = endX;
    data[offset + 3] = endY;
    data[offset + 4] = width;
    data[offset + 5] = dash;
    data[offset + 6] = gap;
    data[offset + 7] = phase;
    data[offset + 8] = color[0];
    data[offset + 9] = color[1];
    data[offset + 10] = color[2];
    data[offset + 11] = color[3];
    this.instanceCount++;
  }

  render(): void {
    if (this.instanceCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.viewportUniform, this.viewportWidth, this.viewportHeight);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    const data = this.instanceData.subarray(0, this.instanceCount * LINE_STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  private grow(): void {
    this.instanceCapacity *= 2;
    const next = new Float32Array(this.instanceCapacity * LINE_STRIDE);
    next.set(this.instanceData);
    this.instanceData = next;
  }
}

export class DashedRingRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instanceVbo: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount = 0;
  private instanceCapacity = 256;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private viewportUniform: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, ringVertexShader, ringFragmentShader);
    this.viewportUniform = gl.getUniformLocation(this.program, "u_viewport")!;

    this.vao = gl.createVertexArray()!;
    this.quadVbo = gl.createBuffer()!;
    this.instanceVbo = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;

    this.instanceData = new Float32Array(this.instanceCapacity * RING_STRIDE);
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

    const strideBytes = RING_STRIDE * FLOAT_SIZE;
    this.bindInstanceAttrib("a_center", 2, strideBytes, 0);
    this.bindInstanceAttrib("a_radius", 1, strideBytes, 8);
    this.bindInstanceAttrib("a_thickness", 1, strideBytes, 12);
    this.bindInstanceAttrib("a_dash", 1, strideBytes, 16);
    this.bindInstanceAttrib("a_gap", 1, strideBytes, 20);
    this.bindInstanceAttrib("a_phase", 1, strideBytes, 24);
    this.bindInstanceAttrib("a_color", 4, strideBytes, 28);

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

  begin(viewportWidth: number, viewportHeight: number): void {
    this.instanceCount = 0;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  addRing(
    centerX: number,
    centerY: number,
    radius: number,
    thickness: number,
    dash: number,
    gap: number,
    phase: number,
    color: [number, number, number, number]
  ): void {
    if (this.instanceCount >= this.instanceCapacity) {
      this.grow();
    }
    const offset = this.instanceCount * RING_STRIDE;
    const data = this.instanceData;
    data[offset + 0] = centerX;
    data[offset + 1] = centerY;
    data[offset + 2] = radius;
    data[offset + 3] = thickness;
    data[offset + 4] = dash;
    data[offset + 5] = gap;
    data[offset + 6] = phase;
    data[offset + 7] = color[0];
    data[offset + 8] = color[1];
    data[offset + 9] = color[2];
    data[offset + 10] = color[3];
    data[offset + 11] = 0;
    this.instanceCount++;
  }

  render(): void {
    if (this.instanceCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.viewportUniform, this.viewportWidth, this.viewportHeight);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    const data = this.instanceData.subarray(0, this.instanceCount * RING_STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  private grow(): void {
    this.instanceCapacity *= 2;
    const next = new Float32Array(this.instanceCapacity * RING_STRIDE);
    next.set(this.instanceData);
    this.instanceData = next;
  }
}
