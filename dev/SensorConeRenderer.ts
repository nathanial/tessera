/**
 * Instanced sensor cone renderer with animated pulse.
 */

import earcut from "earcut";
import { createProgram } from "../src/shaders/compile";

const vertexShader = `#version 300 es
precision highp float;

in vec2 a_local;
in vec2 a_center;
in float a_size;
in float a_rotation;
in float a_phase;
in vec4 a_color;

uniform mat4 u_matrix;

out vec2 v_local;
out float v_phase;
out vec4 v_color;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  vec2 scaled = a_local * a_size;
  vec2 rotated = vec2(
    c * scaled.x - s * scaled.y,
    s * scaled.x + c * scaled.y
  );
  vec2 world = a_center + rotated;
  vec4 clip = u_matrix * vec4(world, 0.0, 1.0);
  gl_Position = vec4(clip.xy / clip.w, clip.z / clip.w, 1.0);
  v_local = a_local;
  v_phase = a_phase;
  v_color = a_color;
}
`;

const fragmentShader = `#version 300 es
precision mediump float;

in vec2 v_local;
in float v_phase;
in vec4 v_color;

uniform float u_time;
uniform float u_unitRadius;
uniform float u_waveFrequency;
uniform float u_waveSharpness;
uniform float u_pulseStrength;
uniform float u_pulseSpeed;
uniform float u_rimWidth;
uniform float u_rimStrength;

out vec4 fragColor;

void main() {
  float tau = 6.28318530718;
  float r = clamp(length(v_local) / u_unitRadius, 0.0, 1.0);
  float wavePhase = (r * u_waveFrequency - u_time * u_pulseSpeed + v_phase) * tau;
  float wave = 0.5 + 0.5 * sin(wavePhase);
  float wave2 = 0.5 + 0.5 * sin((r * (u_waveFrequency * 1.7) - u_time * (u_pulseSpeed * 1.3) + v_phase * 1.3) * tau);
  float band = pow(wave, u_waveSharpness) * 0.7 + pow(wave2, u_waveSharpness * 0.8) * 0.3;

  float falloff = pow(1.0 - r, 0.6);
  float rim = smoothstep(1.0 - u_rimWidth, 1.0, r);

  float angleNorm = (atan(v_local.y, v_local.x) + 3.14159265) / tau;
  float noise = fract(sin(dot(vec2(angleNorm, r + v_phase), vec2(12.9898, 78.233))) * 43758.5453);
  float modulate = mix(0.85, 1.15, noise);

  float align = r > 0.001 ? clamp(dot(normalize(v_local), vec2(0.0, -1.0)), 0.0, 1.0) : 1.0;
  float intensity = (0.15 + band * u_pulseStrength + rim * u_rimStrength) * falloff * modulate;
  intensity *= mix(0.7, 1.0, align);

  vec3 color = v_color.rgb * (0.8 + rim * 0.6 + band * 0.2);
  fragColor = vec4(color, v_color.a * intensity);
}
`;

const FLOAT_SIZE = 4;
const INSTANCE_STRIDE = 9;

export const SENSOR_CONE_UNIT_RADIUS = 1.8;
const SENSOR_CONE_ANGLE = Math.PI / 3; // 60 degrees
const SENSOR_CONE_SEGMENTS = 20;

const sensorConeVertices: number[] = [];
sensorConeVertices.push(0, 0);
for (let i = 0; i <= SENSOR_CONE_SEGMENTS; i++) {
  const t = -SENSOR_CONE_ANGLE / 2 + (SENSOR_CONE_ANGLE * i) / SENSOR_CONE_SEGMENTS;
  const x = Math.sin(t) * SENSOR_CONE_UNIT_RADIUS;
  const y = -Math.cos(t) * SENSOR_CONE_UNIT_RADIUS;
  sensorConeVertices.push(x, y);
}
const sensorConeIndices = earcut(sensorConeVertices);

export class SensorConeRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vertexBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private instanceBuffer: WebGLBuffer;
  private instanceData: Float32Array;
  private instanceCount = 0;
  private instanceCapacity = 512;
  private matrixUniform: WebGLUniformLocation;
  private timeUniform: WebGLUniformLocation;
  private unitRadiusUniform: WebGLUniformLocation;
  private waveFrequencyUniform: WebGLUniformLocation;
  private waveSharpnessUniform: WebGLUniformLocation;
  private pulseStrengthUniform: WebGLUniformLocation;
  private pulseSpeedUniform: WebGLUniformLocation;
  private rimWidthUniform: WebGLUniformLocation;
  private rimStrengthUniform: WebGLUniformLocation;
  private matrix: Float32Array | null = null;
  private timeSeconds = 0;
  private speedMultiplier = 1;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertexShader, fragmentShader);
    this.matrixUniform = gl.getUniformLocation(this.program, "u_matrix")!;
    this.timeUniform = gl.getUniformLocation(this.program, "u_time")!;
    this.unitRadiusUniform = gl.getUniformLocation(this.program, "u_unitRadius")!;
    this.waveFrequencyUniform = gl.getUniformLocation(this.program, "u_waveFrequency")!;
    this.waveSharpnessUniform = gl.getUniformLocation(this.program, "u_waveSharpness")!;
    this.pulseStrengthUniform = gl.getUniformLocation(this.program, "u_pulseStrength")!;
    this.pulseSpeedUniform = gl.getUniformLocation(this.program, "u_pulseSpeed")!;
    this.rimWidthUniform = gl.getUniformLocation(this.program, "u_rimWidth")!;
    this.rimStrengthUniform = gl.getUniformLocation(this.program, "u_rimStrength")!;

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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sensorConeVertices), gl.STATIC_DRAW);

    const aLocal = gl.getAttribLocation(this.program, "a_local");
    if (aLocal >= 0) {
      gl.enableVertexAttribArray(aLocal);
      gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, 2 * FLOAT_SIZE, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sensorConeIndices), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);

    const strideBytes = INSTANCE_STRIDE * FLOAT_SIZE;
    this.bindInstanceAttrib("a_center", 2, strideBytes, 0);
    this.bindInstanceAttrib("a_size", 1, strideBytes, 8);
    this.bindInstanceAttrib("a_rotation", 1, strideBytes, 12);
    this.bindInstanceAttrib("a_phase", 1, strideBytes, 16);
    this.bindInstanceAttrib("a_color", 4, strideBytes, 20);

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

  begin(matrix: Float32Array, timeSeconds: number, speedMultiplier: number): void {
    this.instanceCount = 0;
    this.matrix = matrix;
    this.timeSeconds = timeSeconds;
    this.speedMultiplier = Math.max(0, speedMultiplier);
  }

  addCone(
    centerX: number,
    centerY: number,
    size: number,
    rotation: number,
    phase: number,
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
    data[offset + 3] = rotation;
    data[offset + 4] = phase;
    data[offset + 5] = color[0];
    data[offset + 6] = color[1];
    data[offset + 7] = color[2];
    data[offset + 8] = color[3];
    this.instanceCount++;
  }

  render(): void {
    if (this.instanceCount === 0 || !this.matrix) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.matrixUniform, false, this.matrix);
    gl.uniform1f(this.timeUniform, this.timeSeconds);
    gl.uniform1f(this.unitRadiusUniform, SENSOR_CONE_UNIT_RADIUS);
    gl.uniform1f(this.waveFrequencyUniform, 4.5);
    gl.uniform1f(this.waveSharpnessUniform, 2.6);
    gl.uniform1f(this.pulseStrengthUniform, 1.2);
    gl.uniform1f(this.pulseSpeedUniform, 0.9 * this.speedMultiplier);
    gl.uniform1f(this.rimWidthUniform, 0.08);
    gl.uniform1f(this.rimStrengthUniform, 0.7);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const data = this.instanceData.subarray(0, this.instanceCount * INSTANCE_STRIDE);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      sensorConeIndices.length,
      gl.UNSIGNED_SHORT,
      0,
      this.instanceCount
    );
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }

  private grow(): void {
    this.instanceCapacity *= 2;
    const next = new Float32Array(this.instanceCapacity * INSTANCE_STRIDE);
    next.set(this.instanceData);
    this.instanceData = next;
  }
}
