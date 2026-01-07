const FLOAT_SIZE = 4;

const VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_color;
uniform mat4 u_mvp;
out vec3 v_color;
void main() {
  v_color = a_color;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_color, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function mat4Identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    const ai0 = a[i] ?? 0;
    const ai1 = a[i + 4] ?? 0;
    const ai2 = a[i + 8] ?? 0;
    const ai3 = a[i + 12] ?? 0;
    out[i] = ai0 * (b[0] ?? 0) + ai1 * (b[1] ?? 0) + ai2 * (b[2] ?? 0) + ai3 * (b[3] ?? 0);
    out[i + 4] = ai0 * (b[4] ?? 0) + ai1 * (b[5] ?? 0) + ai2 * (b[6] ?? 0) + ai3 * (b[7] ?? 0);
    out[i + 8] = ai0 * (b[8] ?? 0) + ai1 * (b[9] ?? 0) + ai2 * (b[10] ?? 0) + ai3 * (b[11] ?? 0);
    out[i + 12] = ai0 * (b[12] ?? 0) + ai1 * (b[13] ?? 0) + ai2 * (b[14] ?? 0) + ai3 * (b[15] ?? 0);
  }
  return out;
}

function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = (2 * far * near) * nf;
  return out;
}

function mat4LookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Float32Array {
  const [ex, ey, ez] = eye;
  const [tx, ty, tz] = target;
  let zx = ex - tx;
  let zy = ey - ty;
  let zz = ez - tz;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen; zy /= zLen; zz /= zLen;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xLen = Math.hypot(xx, xy, xz) || 1;
  xx /= xLen; xy /= xLen; xz /= xLen;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const out = mat4Identity();
  out[0] = xx; out[4] = xy; out[8] = xz;
  out[1] = yx; out[5] = yy; out[9] = yz;
  out[2] = zx; out[6] = zy; out[10] = zz;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  return out;
}

function mat4RotateY(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = mat4Identity();
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

function mat4RotateX(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = mat4Identity();
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

function createCubeData(): { vertices: Float32Array; indices: Uint16Array } {
  // 24 vertices (4 per face) with per-face colors
  const positions = [
    // Front (z+)
    -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,  1,
    // Back (z-)
    -1, -1, -1, -1,  1, -1,  1,  1, -1,  1, -1, -1,
    // Top (y+)
    -1,  1, -1, -1,  1,  1,  1,  1,  1,  1,  1, -1,
    // Bottom (y-)
    -1, -1, -1,  1, -1, -1,  1, -1,  1, -1, -1,  1,
    // Right (x+)
     1, -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,
    // Left (x-)
    -1, -1, -1, -1, -1,  1, -1,  1,  1, -1,  1, -1,
  ];

  const colors = [
    // Front - cyan
    0.2, 0.9, 0.95,  0.2, 0.9, 0.95,  0.2, 0.9, 0.95,  0.2, 0.9, 0.95,
    // Back - deep blue
    0.1, 0.2, 0.5,  0.1, 0.2, 0.5,  0.1, 0.2, 0.5,  0.1, 0.2, 0.5,
    // Top - teal
    0.2, 0.7, 0.6,  0.2, 0.7, 0.6,  0.2, 0.7, 0.6,  0.2, 0.7, 0.6,
    // Bottom - slate
    0.15, 0.3, 0.4,  0.15, 0.3, 0.4,  0.15, 0.3, 0.4,  0.15, 0.3, 0.4,
    // Right - green
    0.3, 0.8, 0.4,  0.3, 0.8, 0.4,  0.3, 0.8, 0.4,  0.3, 0.8, 0.4,
    // Left - purple
    0.6, 0.4, 0.9,  0.6, 0.4, 0.9,  0.6, 0.4, 0.9,  0.6, 0.4, 0.9,
  ];

  const vertices = new Float32Array((positions.length / 3) * 6);
  for (let i = 0, v = 0; i < positions.length; i += 3, v += 6) {
    vertices[v] = positions[i] ?? 0;
    vertices[v + 1] = positions[i + 1] ?? 0;
    vertices[v + 2] = positions[i + 2] ?? 0;
    vertices[v + 3] = colors[i] ?? 0;
    vertices[v + 4] = colors[i + 1] ?? 0;
    vertices[v + 5] = colors[i + 2] ?? 0;
  }

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,       // Front
    4, 5, 6, 4, 6, 7,       // Back
    8, 9, 10, 8, 10, 11,    // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23, // Left
  ]);

  return { vertices, indices };
}

export function startSpinningCube(canvas: HTMLCanvasElement): { stop: () => void; resize: () => void } {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) {
    throw new Error("WebGL2 not supported for cube preview");
  }

  const program = createProgram(gl);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const colorLoc = gl.getAttribLocation(program, "a_color");
  const mvpLoc = gl.getUniformLocation(program, "u_mvp");

  const { vertices, indices } = createCubeData();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const stride = 6 * FLOAT_SIZE;
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, stride, 0);

  gl.enableVertexAttribArray(colorLoc);
  gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 3 * FLOAT_SIZE);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  let animationId: number | null = null;
  let startTime = performance.now();

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const render = (time: number) => {
    resize();

    const elapsed = (time - startTime) / 1000;
    const aspect = canvas.width / canvas.height;

    const projection = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
    const view = mat4LookAt([3.2, 2.6, 3.2], [0, 0, 0], [0, 1, 0]);
    const rotY = mat4RotateY(elapsed * 0.9);
    const rotX = mat4RotateX(elapsed * 0.6);
    const model = mat4Multiply(rotY, rotX);
    const mvp = mat4Multiply(projection, mat4Multiply(view, model));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniformMatrix4fv(mvpLoc, false, mvp);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    animationId = requestAnimationFrame(render);
  };

  animationId = requestAnimationFrame(render);

  return {
    stop: () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
    resize,
  };
}
