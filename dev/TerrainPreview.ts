const VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_mvp;
uniform mat4 u_model;
uniform vec3 u_lightDir;
out float v_light;
void main() {
  vec3 normal = normalize(mat3(u_model) * a_normal);
  float diff = max(dot(normal, normalize(-u_lightDir)), 0.0);
  v_light = 0.2 + 0.8 * diff;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float v_light;
out vec4 fragColor;
void main() {
  vec3 base = vec3(0.12, 0.45, 0.32);
  fragColor = vec4(base * v_light, 1.0);
}
`;

const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;
const QUANTIZED_MAX = 32767;

interface TerrainLayer {
  tiles: string[];
  projection?: string;
  scheme?: "tms" | "xyz";
  extensions?: string[];
}

interface TerrainMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

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

function appendAccessToken(url: string, token: string): string {
  if (url.includes("access_token=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_token=${token}`;
}

async function fetchIonLayer(token: string): Promise<TerrainLayer & { baseUrl: string; accessToken: string }> {
  const endpoint = await fetch(`https://api.cesium.com/v1/assets/1/endpoint?access_token=${token}`);
  if (!endpoint.ok) {
    throw new Error("Failed to fetch Cesium terrain endpoint");
  }
  const endpointJson = await endpoint.json();
  const baseUrl = endpointJson.url as string;
  const accessToken = endpointJson.accessToken as string;
  const layerUrl = appendAccessToken(`${baseUrl}layer.json`, accessToken);
  const layerResponse = await fetch(layerUrl);
  if (!layerResponse.ok) {
    throw new Error("Failed to fetch Cesium terrain layer.json");
  }
  const layer = (await layerResponse.json()) as TerrainLayer;
  return { ...layer, baseUrl, accessToken };
}

function decodeZigZag(value: number): number {
  return (value >> 1) ^ (-(value & 1));
}

function decodeDeltaArray(view: DataView, offset: number, count: number): { values: Uint32Array; offset: number } {
  const values = new Uint32Array(count);
  let accum = 0;
  for (let i = 0; i < count; i++) {
    const encoded = view.getUint16(offset, true);
    offset += 2;
    const delta = decodeZigZag(encoded);
    accum += delta;
    values[i] = accum;
  }
  return { values, offset };
}

function decodeIndices(view: DataView, offset: number, count: number): { indices: Uint32Array; offset: number } {
  const indices = new Uint32Array(count);
  let highest = 0;
  for (let i = 0; i < count; i++) {
    const code = view.getUint16(offset, true);
    offset += 2;
    const index = highest - code;
    indices[i] = index;
    if (code === 0) {
      highest++;
    }
  }
  return { indices, offset };
}

function lonLatToTileXY(lon: number, lat: number, zoom: number, projection: string, scheme: "tms" | "xyz"): { x: number; y: number } {
  const tiles = 1 << zoom;
  if (projection === "EPSG:3857") {
    const x = Math.floor(((lon + 180) / 360) * tiles);
    const latRad = (lat * Math.PI) / 180;
    const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const yRaw = Math.floor((1 - merc / Math.PI) / 2 * tiles);
    const y = scheme === "tms" ? tiles - 1 - yRaw : yRaw;
    return { x, y };
  }

  const tileWidth = 360 / tiles;
  const tileHeight = 180 / tiles;
  const x = Math.floor((lon + 180) / tileWidth);
  const yRaw = Math.floor((90 - lat) / tileHeight);
  const y = scheme === "tms" ? tiles - 1 - yRaw : yRaw;
  return { x, y };
}

function tileBounds(x: number, y: number, zoom: number, projection: string, scheme: "tms" | "xyz") {
  const tiles = 1 << zoom;
  const yForBounds = scheme === "tms" ? tiles - 1 - y : y;

  if (projection === "EPSG:3857") {
    const west = (x / tiles) * 360 - 180;
    const east = ((x + 1) / tiles) * 360 - 180;

    const northRad = Math.PI - (2 * Math.PI * yForBounds) / tiles;
    const southRad = Math.PI - (2 * Math.PI * (yForBounds + 1)) / tiles;
    const north = (Math.atan(Math.sinh(northRad)) * 180) / Math.PI;
    const south = (Math.atan(Math.sinh(southRad)) * 180) / Math.PI;

    return { west, east, south, north };
  }

  const tileWidth = 360 / tiles;
  const tileHeight = 180 / tiles;
  const west = -180 + x * tileWidth;
  const east = west + tileWidth;
  const north = 90 - yForBounds * tileHeight;
  const south = north - tileHeight;
  return { west, east, south, north };
}

function lonLatHeightToECEF(lonDeg: number, latDeg: number, height: number): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (N + height) * cosLat * cosLon;
  const y = (N + height) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + height) * sinLat;
  return [x, y, z];
}

function ecefToEnu(
  x: number,
  y: number,
  z: number,
  refLon: number,
  refLat: number,
  refX: number,
  refY: number,
  refZ: number
): [number, number, number] {
  const sinLat = Math.sin(refLat);
  const cosLat = Math.cos(refLat);
  const sinLon = Math.sin(refLon);
  const cosLon = Math.cos(refLon);

  const dx = x - refX;
  const dy = y - refY;
  const dz = z - refZ;

  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  return [east, north, up];
}

function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] ?? 0;
    const i1 = indices[i + 1] ?? 0;
    const i2 = indices[i + 2] ?? 0;

    const ax = positions[i0 * 3] ?? 0;
    const ay = positions[i0 * 3 + 1] ?? 0;
    const az = positions[i0 * 3 + 2] ?? 0;

    const bx = positions[i1 * 3] ?? 0;
    const by = positions[i1 * 3 + 1] ?? 0;
    const bz = positions[i1 * 3 + 2] ?? 0;

    const cx = positions[i2 * 3] ?? 0;
    const cy = positions[i2 * 3 + 1] ?? 0;
    const cz = positions[i2 * 3 + 2] ?? 0;

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;

    const base0 = i0 * 3;
    const base1 = i1 * 3;
    const base2 = i2 * 3;

    normals[base0] = (normals[base0] ?? 0) + nx;
    normals[base0 + 1] = (normals[base0 + 1] ?? 0) + ny;
    normals[base0 + 2] = (normals[base0 + 2] ?? 0) + nz;
    normals[base1] = (normals[base1] ?? 0) + nx;
    normals[base1 + 1] = (normals[base1 + 1] ?? 0) + ny;
    normals[base1 + 2] = (normals[base1 + 2] ?? 0) + nz;
    normals[base2] = (normals[base2] ?? 0) + nx;
    normals[base2 + 1] = (normals[base2 + 1] ?? 0) + ny;
    normals[base2 + 2] = (normals[base2 + 2] ?? 0) + nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i] ?? 0;
    const ny = normals[i + 1] ?? 0;
    const nz = normals[i + 2] ?? 0;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / len;
    normals[i + 1] = ny / len;
    normals[i + 2] = nz / len;
  }

  return normals;
}

async function loadTerrainMesh(token: string, lat: number, lon: number, zoom: number): Promise<TerrainMesh> {
  const layer = await fetchIonLayer(token);
  const scheme = layer.scheme ?? "tms";
  const projection = layer.projection ?? "EPSG:4326";

  const { x, y } = lonLatToTileXY(lon, lat, zoom, projection, scheme);
  const tileTemplate = layer.tiles[0] ?? "";

  const tileUrl = appendAccessToken(
    tileTemplate
      .replace("{z}", `${zoom}`)
      .replace("{x}", `${x}`)
      .replace("{y}", `${y}`)
      .replace("{version}", "1.0")
      .replace("{ext}", "terrain"),
    layer.accessToken
  );

  const response = await fetch(tileUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch terrain tile");
  }
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);

  let offset = 0;
  const centerX = view.getFloat64(offset, true); offset += 8;
  const centerY = view.getFloat64(offset, true); offset += 8;
  const centerZ = view.getFloat64(offset, true); offset += 8;
  const minHeight = view.getFloat32(offset, true); offset += 4;
  const maxHeight = view.getFloat32(offset, true); offset += 4;
  offset += 4 * 8; // skip bounding sphere center (3 doubles) + radius
  offset += 3 * 8; // skip horizon occlusion point

  const vertexCount = view.getUint32(offset, true); offset += 4;
  const uData = decodeDeltaArray(view, offset, vertexCount);
  const vData = decodeDeltaArray(view, uData.offset, vertexCount);
  const hData = decodeDeltaArray(view, vData.offset, vertexCount);
  offset = hData.offset;

  const indexCount = view.getUint32(offset, true); offset += 4;
  const indexData = decodeIndices(view, offset, indexCount);

  const bounds = tileBounds(x, y, zoom, projection, scheme);
  const centerLon = (bounds.west + bounds.east) / 2;
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerECEF = lonLatHeightToECEF(centerLon, centerLat, 0);
  const refLon = (centerLon * Math.PI) / 180;
  const refLat = (centerLat * Math.PI) / 180;

  const positions = new Float32Array(vertexCount * 3);
  const heightRange = maxHeight - minHeight;
  const heightScale = 1.3;
  const scale = 1 / 1000;

  for (let i = 0; i < vertexCount; i++) {
    const u = (uData.values[i] ?? 0) / QUANTIZED_MAX;
    const v = (vData.values[i] ?? 0) / QUANTIZED_MAX;
    const h = (hData.values[i] ?? 0) / QUANTIZED_MAX;

    const lonDeg = bounds.west + u * (bounds.east - bounds.west);
    const latDeg = bounds.south + v * (bounds.north - bounds.south);
    const height = minHeight + h * heightRange * heightScale;

    const [xEcef, yEcef, zEcef] = lonLatHeightToECEF(lonDeg, latDeg, height);
    const [east, north, up] = ecefToEnu(
      xEcef,
      yEcef,
      zEcef,
      refLon,
      refLat,
      centerECEF[0],
      centerECEF[1],
      centerECEF[2]
    );

    positions[i * 3] = east * scale;
    positions[i * 3 + 1] = north * scale;
    positions[i * 3 + 2] = up * scale;
  }

  const normals = computeNormals(positions, indexData.indices);

  return {
    positions,
    normals,
    indices: indexData.indices,
  };
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

function mat4RotateZ(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = mat4Identity();
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

export function startTerrainPreview(canvas: HTMLCanvasElement): { stop: () => void; resize: () => void } {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) {
    throw new Error("WebGL2 not supported for terrain preview");
  }

  const token =
    (import.meta as { env?: { VITE_CESIUM_TOKEN?: string } }).env?.VITE_CESIUM_TOKEN ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYzA4YzQzZS05MGQzLTRiYjItOTZlOC0xZjQ2NjYxNDNlMWMiLCJpZCI6MjE0Njg1LCJpYXQiOjE3MTU1NzIxOTB9.HH1wsTeS17mag5SRH7eZF6gMtf_IEWO6P1yWZVjxRO0";

  const program = createProgram(gl);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const normalLoc = gl.getAttribLocation(program, "a_normal");
  const mvpLoc = gl.getUniformLocation(program, "u_mvp");
  const modelLoc = gl.getUniformLocation(program, "u_model");
  const lightLoc = gl.getUniformLocation(program, "u_lightDir");

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const nbo = gl.createBuffer();
  const ibo = gl.createBuffer();

  let indexCount = 0;
  let meshReady = false;
  let animationId: number | null = null;

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

  const load = async () => {
    const mesh = await loadTerrainMesh(token, 46.8523, -121.7603, 8);
    indexCount = mesh.indices.length;

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    meshReady = true;
  };

  void load();

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  const render = (time: number) => {
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (meshReady) {
      const elapsed = time / 1000;
      const aspect = canvas.width / canvas.height;
      const projection = mat4Perspective(Math.PI / 3.5, aspect, 0.01, 100);
      const view = mat4LookAt([0, -2.2, 1.6], [0, 0, 0.2], [0, 0, 1]);
      const model = mat4RotateZ(elapsed * 0.1);
      const mvp = mat4Multiply(projection, mat4Multiply(view, model));

      gl.useProgram(program);
      gl.uniformMatrix4fv(mvpLoc, false, mvp);
      gl.uniformMatrix4fv(modelLoc, false, model);
      gl.uniform3f(lightLoc, -0.4, -0.6, 1.0);

      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

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
      gl.deleteBuffer(nbo);
      gl.deleteBuffer(ibo);
      if (vao) gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
    resize,
  };
}
