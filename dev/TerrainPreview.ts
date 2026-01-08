import { TILE_SIZE } from "../src/constants";
import { lonLatToTessera, tesseraToLonLat } from "../src/geo/projection";
import type { DrawContext } from "../src/index";
import type { Aircraft } from "./adsb";
import { getAltitudeColor } from "./adsb";
import { getWrappedX } from "./CoordinateUtils";
import type { EditableAreasState } from "./EditableAreas";
import { renderEditableAreas } from "./EditableAreas";
import { LabelPlacer, type LabelItem } from "./labels";

const LABEL_FONT_SIZE = 18;
const LABEL_CHAR_WIDTH = 0.55;
const LABEL_FONT = "600 18px Arial";

const SKIRT_LIGHT_MIN = 0.6;

const VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in float a_skirt;
in vec2 a_tessera;
uniform mat4 u_mvp;
uniform mat4 u_model;
uniform vec3 u_lightDir;
uniform float u_lightMix;
out float v_light;
out float v_skirt;
out vec2 v_uv;
out vec2 v_tessera;
void main() {
  vec3 normal = normalize(mat3(u_model) * a_normal);
  float diff = max(dot(normal, normalize(-u_lightDir)), 0.0);
  float lighting = 0.5 + 0.5 * diff;
  float lit = mix(1.0, lighting, u_lightMix);
  float skirtLight = max(lit, ${SKIRT_LIGHT_MIN});
  v_light = mix(lit, skirtLight, a_skirt);
  v_skirt = a_skirt;
  v_uv = a_uv;
  v_tessera = a_tessera;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float v_light;
in float v_skirt;
in vec2 v_uv;
in vec2 v_tessera;
uniform sampler2D u_texture;
uniform float u_textureMix;
uniform vec3 u_color;
uniform int u_clipCount;
uniform vec4 u_clipRect0;
uniform vec4 u_clipRect1;
uniform float u_skirtCut;
out vec4 fragColor;
void main() {
  if (u_skirtCut > 0.5 && v_skirt > 0.5) {
    discard;
  }
  if (u_clipCount > 0) {
    bool inside = v_tessera.x >= u_clipRect0.x && v_tessera.x <= u_clipRect0.z &&
      v_tessera.y >= u_clipRect0.y && v_tessera.y <= u_clipRect0.w;
    if (u_clipCount > 1) {
      inside = inside || (v_tessera.x >= u_clipRect1.x && v_tessera.x <= u_clipRect1.z &&
        v_tessera.y >= u_clipRect1.y && v_tessera.y <= u_clipRect1.w);
    }
    if (inside) {
      discard;
    }
  }
  vec3 texColor = texture(u_texture, v_uv).rgb;
  texColor = pow(texColor, vec3(1.0 / 1.6));
  texColor = clamp(texColor * 1.2, 0.0, 1.0);
  vec3 baseColor = mix(u_color, texColor, u_textureMix);
  fragColor = vec4(baseColor * v_light, 1.0);
}
`;

const AIRCRAFT_VERTEX_SHADER = `#version 300 es
in vec3 a_shape;
in vec3 a_normal;
in vec3 a_instancePos;
in float a_heading;
in float a_size;
in vec3 a_color;
uniform mat4 u_mvp;
uniform vec3 u_lightDir;
out vec3 v_color;
out float v_light;
void main() {
  float angle = -a_heading;
  float c = cos(angle);
  float s = sin(angle);
  vec3 rotated = vec3(
    a_shape.x * c - a_shape.y * s,
    a_shape.x * s + a_shape.y * c,
    a_shape.z
  );
  vec3 world = a_instancePos + rotated * a_size;
  vec3 normal = vec3(
    a_normal.x * c - a_normal.y * s,
    a_normal.x * s + a_normal.y * c,
    a_normal.z
  );
  v_light = 0.35 + 0.65 * max(dot(normalize(normal), normalize(-u_lightDir)), 0.0);
  gl_Position = u_mvp * vec4(world, 1.0);
  v_color = a_color;
}
`;

const AIRCRAFT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_light;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_color * v_light, 0.96);
}
`;

const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;
const QUANTIZED_MAX = 32767;
const TILE_RANGE = 1;
const MAX_TOTAL_VERTICES = 4000000;
const ORBIT_SPEED = 0.005;
const PAN_SPEED = 1.0;
const MIN_ELEVATION = -1.2;
const MAX_ELEVATION = 1.2;
const FOV = Math.PI / 3.5;
const RASTER_ZOOM_OFFSET = 0;
const MAX_RASTER_TILES = 64;
const LIGHT_DIR: [number, number, number] = [0.1, 0.2, -1.4];
const AIRCRAFT_BASE: Array<[number, number]> = [
  [0, 1],
  [-0.5, -0.8],
  [0.5, -0.8],
];
const AIRCRAFT_HALF_HEIGHT = 0.25;
const AIRCRAFT_SHAPE = buildExtrudedShape(AIRCRAFT_BASE, AIRCRAFT_HALF_HEIGHT);
const AIRCRAFT_VERTEX_COUNT = AIRCRAFT_SHAPE.positions.length / 3;
const AIRCRAFT_INSTANCE_STRIDE = 8;
const AIRCRAFT_MAX_INSTANCES = 3000;
const AIRCRAFT_SCREEN_SIZE = 15;
const AIRCRAFT_FULL_SIZE_ZOOM = 8;
const AIRCRAFT_MIN_SIZE = 3;
const AIRCRAFT_ALTITUDE_OFFSET = 60;
const DETAIL_BLEND_BAND_PX = 80;
const LOD_MIN_ZOOM = 0;
const LOD_DETAIL_ZOOM_GAP = 1;
const LOD_MAX_TILES = 96;
const LOD_SPLIT_RATIO = 2.5;
const LOD_EDGE_BLEND_FRACTION = 0.2;
const AREA_OVERLAY_HEIGHT_METERS = 0;
const IDENTITY_MAT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

type ScreenPoint = { x: number; y: number };
type ProjectToScreen = (x: number, y: number) => ScreenPoint | null;

interface HeightSampler {
  sample: (x: number, y: number) => number | null;
}

interface LodMeshState {
  zoom: number;
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  nbo: WebGLBuffer | null;
  uvbo: WebGLBuffer | null;
  skbo: WebGLBuffer | null;
  tbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  indexCount: number;
  indexType: number;
  meshReady: boolean;
  atlas: RasterAtlas | null;
  textureReady: boolean;
  loadId: number;
  meshData: TerrainMesh | null;
  basePositions: Float32Array | null;
}

const toCssColor = (color: [number, number, number, number]): string => {
  const r = Math.round(clamp(color[0] ?? 0, 0, 1) * 255);
  const g = Math.round(clamp(color[1] ?? 0, 0, 1) * 255);
  const b = Math.round(clamp(color[2] ?? 0, 0, 1) * 255);
  const a = clamp(color[3] ?? 1, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

class ProjectedCanvasDraw {
  private ctx: CanvasRenderingContext2D;
  private project: ProjectToScreen;
  private pathOpen = false;
  private pathHasPoint = false;
  private fillValue: [number, number, number, number] = [1, 1, 1, 1];
  private strokeValue: [number, number, number, number] = [1, 1, 1, 1];
  private lineValue = 1;

  constructor(ctx: CanvasRenderingContext2D, project: ProjectToScreen) {
    this.ctx = ctx;
    this.project = project;
  }

  set fillStyle(color: [number, number, number, number]) {
    this.fillValue = color;
    this.ctx.fillStyle = toCssColor(color);
  }

  get fillStyle(): [number, number, number, number] {
    return this.fillValue;
  }

  set strokeStyle(color: [number, number, number, number]) {
    this.strokeValue = color;
    this.ctx.strokeStyle = toCssColor(color);
  }

  get strokeStyle(): [number, number, number, number] {
    return this.strokeValue;
  }

  set lineWidth(width: number) {
    this.lineValue = width;
    this.ctx.lineWidth = width;
  }

  get lineWidth(): number {
    return this.lineValue;
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  beginPath(): void {
    this.ctx.beginPath();
    this.pathOpen = false;
    this.pathHasPoint = false;
  }

  moveTo(x: number, y: number): void {
    const point = this.project(x, y);
    if (!point) {
      this.pathOpen = false;
      return;
    }
    this.ctx.moveTo(point.x, point.y);
    this.pathOpen = true;
    this.pathHasPoint = true;
  }

  lineTo(x: number, y: number): void {
    const point = this.project(x, y);
    if (!point) {
      this.pathOpen = false;
      return;
    }
    if (!this.pathOpen) {
      this.ctx.moveTo(point.x, point.y);
    } else {
      this.ctx.lineTo(point.x, point.y);
    }
    this.pathOpen = true;
    this.pathHasPoint = true;
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false
  ): void {
    const span = counterclockwise ? startAngle - endAngle : endAngle - startAngle;
    const steps = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI / 16)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + span * t;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) {
        this.moveTo(px, py);
      } else {
        this.lineTo(px, py);
      }
    }
  }

  closePath(): void {
    if (this.pathOpen) {
      this.ctx.closePath();
    }
  }

  fill(): void {
    if (this.pathHasPoint) {
      this.ctx.fill();
    }
  }

  stroke(): void {
    if (this.pathHasPoint) {
      this.ctx.stroke();
    }
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    const p0 = this.project(x, y);
    const p1 = this.project(x + width, y);
    const p2 = this.project(x + width, y + height);
    const p3 = this.project(x, y + height);
    if (!p0 || !p1 || !p2 || !p3) return;
    this.ctx.beginPath();
    this.ctx.moveTo(p0.x, p0.y);
    this.ctx.lineTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.lineTo(p3.x, p3.y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    const p0 = this.project(x, y);
    const p1 = this.project(x + width, y);
    const p2 = this.project(x + width, y + height);
    const p3 = this.project(x, y + height);
    if (!p0 || !p1 || !p2 || !p3) return;
    this.ctx.beginPath();
    this.ctx.moveTo(p0.x, p0.y);
    this.ctx.lineTo(p1.x, p1.y);
    this.ctx.lineTo(p2.x, p2.y);
    this.ctx.lineTo(p3.x, p3.y);
    this.ctx.closePath();
    this.ctx.stroke();
  }
}

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
  tesseraCoords: Float32Array;
  skirtMask: Float32Array;
  edgeDistance: Float32Array;
  radius: number;
  halfWidth: number;
  halfHeight: number;
  reference: TerrainReference;
  offset: [number, number, number];
  scale: number;
}

interface TerrainView {
  centerX: number;
  centerY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

interface DecodedTile {
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  tesseraCoords: Float32Array<ArrayBuffer>;
  skirtMask: Float32Array<ArrayBuffer>;
  edgeIndices: Uint32Array<ArrayBuffer>;
  edgeDistance: Float32Array<ArrayBuffer>;
}

interface TerrainReference {
  lon: number;
  lat: number;
  lonRad: number;
  latRad: number;
  ecef: [number, number, number];
}

interface LonLatBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

interface TileRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  xTiles: number;
  yTiles: number;
}

function buildExtrudedShape(
  base: Array<[number, number]>,
  halfHeight: number
): { positions: Float32Array; normals: Float32Array } {
  const positions: number[] = [];
  const normals: number[] = [];

  const pushTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const n0 = nx / len;
    const n1 = ny / len;
    const n2 = nz / len;
    normals.push(n0, n1, n2, n0, n1, n2, n0, n1, n2);
  };

  const top = base.map(([x, y]) => [x, y, halfHeight] as [number, number, number]);
  const bottom = base.map(([x, y]) => [x, y, -halfHeight] as [number, number, number]);

  if (base.length >= 3) {
    pushTri(top[0]!, top[1]!, top[2]!);
    pushTri(bottom[0]!, bottom[2]!, bottom[1]!);
  }

  for (let i = 0; i < base.length; i++) {
    const next = (i + 1) % base.length;
    const aTop = top[i]!;
    const bTop = top[next]!;
    const aBottom = bottom[i]!;
    const bBottom = bottom[next]!;
    pushTri(aTop, bTop, bBottom);
    pushTri(aTop, bBottom, aBottom);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
  };
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

function createProgramWithSource(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  return createProgramWithSource(gl, VERTEX_SHADER, FRAGMENT_SHADER);
}

function appendAccessToken(url: string, token: string): string {
  if (url.includes("access_token=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}access_token=${token}`;
}

function getRasterTileUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

async function loadRasterTileImage(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  const url = getRasterTileUrl(z, x, y);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
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

function decodeDeltaArray(view: DataView, offset: number, count: number): { values: Uint32Array<ArrayBuffer>; offset: number } {
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

function decodeIndices(view: DataView, offset: number, count: number): { indices: Uint32Array<ArrayBuffer>; offset: number } {
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

function decodeEdgeIndices(view: DataView, offset: number): { indices: Uint32Array<ArrayBuffer>; offset: number } {
  if (offset + 4 > view.byteLength) {
    return { indices: new Uint32Array(0), offset };
  }
  const length = view.getUint32(offset, true);
  offset += 4;
  const indices = new Uint32Array(length);
  for (let i = 0; i < length; i++) {
    if (offset + 2 > view.byteLength) break;
    indices[i] = view.getUint16(offset, true);
    offset += 2;
  }
  return { indices, offset };
}

function tileCounts(projection: string, zoom: number): { xTiles: number; yTiles: number } {
  if (projection === "EPSG:4326") {
    return { xTiles: 1 << (zoom + 1), yTiles: 1 << zoom };
  }
  const tiles = 1 << zoom;
  return { xTiles: tiles, yTiles: tiles };
}

function mercatorToLonLat(mercX: number, mercY: number): { lonDeg: number; latDeg: number } {
  const lonRad = mercX / WGS84_A;
  const latRad = 2 * Math.atan(Math.exp(mercY / WGS84_A)) - Math.PI / 2;
  return {
    lonDeg: (lonRad * 180) / Math.PI,
    latDeg: (latRad * 180) / Math.PI,
  };
}

function parseQuantizedMesh(view: DataView): {
  u: Uint32Array<ArrayBuffer>;
  v: Uint32Array<ArrayBuffer>;
  h: Uint32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  westIndices: Uint32Array<ArrayBuffer>;
  southIndices: Uint32Array<ArrayBuffer>;
  eastIndices: Uint32Array<ArrayBuffer>;
  northIndices: Uint32Array<ArrayBuffer>;
  minHeight: number;
  maxHeight: number;
  vertexCount: number;
} {
  let offset = 0;
  offset += 3 * 8; // skip tile center
  const minHeight = view.getFloat32(offset, true); offset += 4;
  const maxHeight = view.getFloat32(offset, true); offset += 4;
  offset += 4 * 8; // skip bounding sphere center (3 doubles) + radius
  offset += 3 * 8; // skip horizon occlusion point

  const vertexCount = view.getUint32(offset, true); offset += 4;
  if (vertexCount <= 0 || vertexCount > 500000) {
    throw new Error(`Unexpected vertex count (${vertexCount})`);
  }

  const uData = decodeDeltaArray(view, offset, vertexCount);
  const vData = decodeDeltaArray(view, uData.offset, vertexCount);
  const hData = decodeDeltaArray(view, vData.offset, vertexCount);
  offset = hData.offset;

  const triangleCount = view.getUint32(offset, true); offset += 4;
  const indexCount = triangleCount * 3;
  const indexData = decodeIndices(view, offset, indexCount);
  offset = indexData.offset;
  const westEdge = decodeEdgeIndices(view, offset);
  offset = westEdge.offset;
  const southEdge = decodeEdgeIndices(view, offset);
  offset = southEdge.offset;
  const eastEdge = decodeEdgeIndices(view, offset);
  offset = eastEdge.offset;
  const northEdge = decodeEdgeIndices(view, offset);

  return {
    u: uData.values,
    v: vData.values,
    h: hData.values,
    indices: indexData.indices,
    westIndices: westEdge.indices,
    southIndices: southEdge.indices,
    eastIndices: eastEdge.indices,
    northIndices: northEdge.indices,
    minHeight,
    maxHeight,
    vertexCount,
  };
}

function lonLatToTileXY(lon: number, lat: number, zoom: number, projection: string, scheme: "tms" | "xyz"): { x: number; y: number } {
  const { xTiles, yTiles } = tileCounts(projection, zoom);
  if (projection === "EPSG:3857") {
    const x = Math.floor(((lon + 180) / 360) * xTiles);
    const latRad = (lat * Math.PI) / 180;
    const merc = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const yRaw = Math.floor((1 - merc / Math.PI) / 2 * yTiles);
    const y = scheme === "tms" ? yTiles - 1 - yRaw : yRaw;
    return { x, y };
  }

  const tileWidth = 360 / xTiles;
  const tileHeight = 180 / yTiles;
  const x = Math.floor((lon + 180) / tileWidth);
  const yRaw = Math.floor((90 - lat) / tileHeight);
  const y = scheme === "tms" ? yTiles - 1 - yRaw : yRaw;
  return { x, y };
}

function tileBounds(x: number, y: number, zoom: number, projection: string, scheme: "tms" | "xyz") {
  const { xTiles, yTiles } = tileCounts(projection, zoom);
  const yForBounds = scheme === "tms" ? yTiles - 1 - y : y;

  if (projection === "EPSG:3857") {
    const worldSpan = 2 * Math.PI * WGS84_A;
    const west = -Math.PI * WGS84_A + (x / xTiles) * worldSpan;
    const east = -Math.PI * WGS84_A + ((x + 1) / xTiles) * worldSpan;
    const north = Math.PI * WGS84_A - (yForBounds / yTiles) * worldSpan;
    const south = Math.PI * WGS84_A - ((yForBounds + 1) / yTiles) * worldSpan;
    return { west, east, south, north };
  }

  const tileWidth = 360 / xTiles;
  const tileHeight = 180 / yTiles;
  const west = -180 + x * tileWidth;
  const east = west + tileWidth;
  const north = 90 - yForBounds * tileHeight;
  const south = north - tileHeight;
  return { west, east, south, north };
}

interface RasterAtlas {
  texture: WebGLTexture;
  zoom: number;
  minTileX: number;
  minTileY: number;
  tilesWide: number;
  tilesHigh: number;
}

function getTesseraBounds(coords: Float32Array): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i] ?? 0;
    const y = coords[i + 1] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function computeRasterRange(bounds: { minX: number; maxX: number; minY: number; maxY: number }, zoom: number): {
  zoom: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
  tilesWide: number;
  tilesHigh: number;
} {
  const tiles = 1 << zoom;
  const maxX = Math.min(bounds.maxX, 1 - 1e-6);
  const maxY = Math.min(bounds.maxY, 1 - 1e-6);
  const minTileX = Math.max(0, Math.floor(bounds.minX * tiles));
  const maxTileX = Math.min(tiles - 1, Math.floor(maxX * tiles));
  const minTileY = Math.max(0, Math.floor(bounds.minY * tiles));
  const maxTileY = Math.min(tiles - 1, Math.floor(maxY * tiles));
  const tilesWide = Math.max(1, maxTileX - minTileX + 1);
  const tilesHigh = Math.max(1, maxTileY - minTileY + 1);
  return { zoom, minTileX, maxTileX, minTileY, maxTileY, tilesWide, tilesHigh };
}

function computeTileRangeFromBounds(
  bounds: LonLatBounds,
  zoom: number,
  projection: string,
  scheme: "tms" | "xyz"
): TileRange {
  const { xTiles, yTiles } = tileCounts(projection, zoom);
  const topLeft = lonLatToTileXY(bounds.west, bounds.north, zoom, projection, scheme);
  const bottomRight = lonLatToTileXY(bounds.east, bounds.south, zoom, projection, scheme);

  let minY = Math.min(topLeft.y, bottomRight.y);
  let maxY = Math.max(topLeft.y, bottomRight.y);
  minY = Math.max(0, Math.min(yTiles - 1, minY));
  maxY = Math.max(0, Math.min(yTiles - 1, maxY));

  let minX = topLeft.x;
  let maxX = bottomRight.x;
  if (bounds.east < bounds.west) {
    if (maxX < minX) {
      maxX += xTiles;
    }
  } else {
    minX = Math.min(topLeft.x, bottomRight.x);
    maxX = Math.max(topLeft.x, bottomRight.x);
  }

  return { minX, maxX, minY, maxY, xTiles, yTiles };
}

async function buildRasterAtlas(
  gl: WebGL2RenderingContext,
  coords: Float32Array,
  desiredZoom: number
): Promise<RasterAtlas | null> {
  const bounds = getTesseraBounds(coords);
  const clamped = {
    minX: clamp(bounds.minX, 0, 1),
    maxX: clamp(bounds.maxX, 0, 1),
    minY: clamp(bounds.minY, 0, 1),
    maxY: clamp(bounds.maxY, 0, 1),
  };

  let zoom = Math.max(0, desiredZoom);
  let range = computeRasterRange(clamped, zoom);
  while (zoom > 0 && range.tilesWide * range.tilesHigh > MAX_RASTER_TILES) {
    zoom -= 1;
    range = computeRasterRange(clamped, zoom);
  }

  const canvas = document.createElement("canvas");
  canvas.width = range.tilesWide * TILE_SIZE;
  canvas.height = range.tilesHigh * TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const tilePromises: Promise<void>[] = [];
  for (let y = range.minTileY; y <= range.maxTileY; y++) {
    for (let x = range.minTileX; x <= range.maxTileX; x++) {
      tilePromises.push((async () => {
        const img = await loadRasterTileImage(range.zoom, x, y);
        if (!img) return;
        const dx = (x - range.minTileX) * TILE_SIZE;
        const dy = (y - range.minTileY) * TILE_SIZE;
        ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
      })());
    }
  }
  await Promise.all(tilePromises);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {
    texture,
    zoom: range.zoom,
    minTileX: range.minTileX,
    minTileY: range.minTileY,
    tilesWide: range.tilesWide,
    tilesHigh: range.tilesHigh,
  };
}

function computeAtlasUVs(coords: Float32Array, atlas: RasterAtlas): Float32Array {
  const uvs = new Float32Array(coords.length);
  const tiles = 1 << atlas.zoom;
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i] ?? 0;
    const y = coords[i + 1] ?? 0;
    const tileX = x * tiles - atlas.minTileX;
    const tileY = y * tiles - atlas.minTileY;
    const u = tileX / atlas.tilesWide;
    const v = tileY / atlas.tilesHigh;
    uvs[i] = clamp(u, 0, 1);
    uvs[i + 1] = clamp(v, 0, 1);
  }
  return uvs;
}

function enuFromLonLat(lonDeg: number, latDeg: number, reference: TerrainReference): [number, number, number] {
  const [xEcef, yEcef, zEcef] = lonLatHeightToECEF(lonDeg, latDeg, 0);
  return ecefToEnu(
    xEcef,
    yEcef,
    zEcef,
    reference.lonRad,
    reference.latRad,
    reference.ecef[0],
    reference.ecef[1],
    reference.ecef[2]
  );
}

function tileCenterLonLat(
  x: number,
  y: number,
  zoom: number,
  projection: string,
  scheme: "tms" | "xyz"
): { lon: number; lat: number } {
  const bounds = tileBounds(x, y, zoom, projection, scheme);
  if (projection === "EPSG:3857") {
    const mercX = (bounds.west + bounds.east) * 0.5;
    const mercY = (bounds.south + bounds.north) * 0.5;
    const lonLat = mercatorToLonLat(mercX, mercY);
    return { lon: lonLat.lonDeg, lat: lonLat.latDeg };
  }
  return {
    lon: (bounds.west + bounds.east) * 0.5,
    lat: (bounds.south + bounds.north) * 0.5,
  };
}

function tileTesseraBounds(
  x: number,
  y: number,
  zoom: number,
  projection: string,
  scheme: "tms" | "xyz"
): { minX: number; maxX: number; minY: number; maxY: number } {
  const bounds = tileBounds(x, y, zoom, projection, scheme);
  const corners =
    projection === "EPSG:3857"
      ? [
        mercatorToLonLat(bounds.west, bounds.south),
        mercatorToLonLat(bounds.east, bounds.south),
        mercatorToLonLat(bounds.east, bounds.north),
        mercatorToLonLat(bounds.west, bounds.north),
      ].map((corner) => ({ lon: corner.lonDeg, lat: corner.latDeg }))
      : [
        { lon: bounds.west, lat: bounds.south },
        { lon: bounds.east, lat: bounds.south },
        { lon: bounds.east, lat: bounds.north },
        { lon: bounds.west, lat: bounds.north },
      ];

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const corner of corners) {
    const tessera = lonLatToTessera(corner.lon, corner.lat);
    minX = Math.min(minX, tessera.x);
    maxX = Math.max(maxX, tessera.x);
    minY = Math.min(minY, tessera.y);
    maxY = Math.max(maxY, tessera.y);
  }

  return { minX, maxX, minY, maxY };
}

function computeTileMetrics(
  x: number,
  y: number,
  zoom: number,
  projection: string,
  scheme: "tms" | "xyz",
  reference: TerrainReference
): { dist: number; size: number } {
  const bounds = tileBounds(x, y, zoom, projection, scheme);
  const corners =
    projection === "EPSG:3857"
      ? [
        mercatorToLonLat(bounds.west, bounds.south),
        mercatorToLonLat(bounds.east, bounds.south),
        mercatorToLonLat(bounds.east, bounds.north),
        mercatorToLonLat(bounds.west, bounds.north),
      ].map((corner) => ({ lon: corner.lonDeg, lat: corner.latDeg }))
      : [
        { lon: bounds.west, lat: bounds.south },
        { lon: bounds.east, lat: bounds.south },
        { lon: bounds.east, lat: bounds.north },
        { lon: bounds.west, lat: bounds.north },
      ];

  const center = tileCenterLonLat(x, y, zoom, projection, scheme);
  const [centerEast, centerNorth] = enuFromLonLat(center.lon, center.lat, reference);

  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  for (const corner of corners) {
    const [east, north] = enuFromLonLat(corner.lon, corner.lat, reference);
    minEast = Math.min(minEast, east);
    maxEast = Math.max(maxEast, east);
    minNorth = Math.min(minNorth, north);
    maxNorth = Math.max(maxNorth, north);
  }

  const width = maxEast - minEast;
  const height = maxNorth - minNorth;
  const size = Math.max(1, Math.max(width, height));
  const dist = Math.hypot(centerEast, centerNorth);
  return { dist, size };
}

function buildAdaptiveLodTiles(
  reference: TerrainReference,
  maxZoom: number,
  projection: string,
  scheme: "tms" | "xyz"
): Map<number, Array<{ x: number; y: number }>> {
  type TileEntry = {
    x: number;
    y: number;
    zoom: number;
    dist: number;
    size: number;
    priority: number;
    key: string;
  };

  const baseZoom = LOD_MIN_ZOOM;
  const { xTiles, yTiles } = tileCounts(projection, baseZoom);
  const leaves = new Map<string, TileEntry>();
  const candidates: TileEntry[] = [];

  const createEntry = (x: number, y: number, zoom: number): TileEntry => {
    const metrics = computeTileMetrics(x, y, zoom, projection, scheme, reference);
    const priority = metrics.dist / Math.max(1, metrics.size);
    const key = `${zoom}/${x}/${y}`;
    return { x, y, zoom, dist: metrics.dist, size: metrics.size, priority, key };
  };

  const shouldSplit = (tile: TileEntry) =>
    tile.zoom < maxZoom && tile.size > 0 && tile.dist / tile.size < LOD_SPLIT_RATIO;

  for (let y = 0; y < yTiles; y++) {
    for (let x = 0; x < xTiles; x++) {
      const entry = createEntry(x, y, baseZoom);
      leaves.set(entry.key, entry);
      if (shouldSplit(entry)) candidates.push(entry);
    }
  }

  const pickBest = () => {
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.shift() ?? null;
  };

  while (candidates.length > 0 && leaves.size + 3 <= LOD_MAX_TILES) {
    const tile = pickBest();
    if (!tile) break;
    if (!leaves.has(tile.key)) continue;
    if (!shouldSplit(tile)) continue;

    leaves.delete(tile.key);
    const nextZoom = tile.zoom + 1;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const child = createEntry(tile.x * 2 + dx, tile.y * 2 + dy, nextZoom);
        leaves.set(child.key, child);
        if (shouldSplit(child)) candidates.push(child);
      }
    }
  }

  const grouped = new Map<number, Array<{ x: number; y: number }>>();
  for (const tile of leaves.values()) {
    const list = grouped.get(tile.zoom);
    if (list) {
      list.push({ x: tile.x, y: tile.y });
    } else {
      grouped.set(tile.zoom, [{ x: tile.x, y: tile.y }]);
    }
  }

  return grouped;
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

function projectTesseraToEnu(
  x: number,
  y: number,
  heightMeters: number,
  reference: TerrainReference,
  scale: number,
  offset: [number, number, number]
): [number, number, number] {
  const lonLat = tesseraToLonLat(x, y);
  const [xEcef, yEcef, zEcef] = lonLatHeightToECEF(lonLat.lon, lonLat.lat, heightMeters);
  const [east, north, up] = ecefToEnu(
    xEcef,
    yEcef,
    zEcef,
    reference.lonRad,
    reference.latRad,
    reference.ecef[0],
    reference.ecef[1],
    reference.ecef[2]
  );
  return [
    east * scale - offset[0],
    north * scale - offset[1],
    up * scale - offset[2],
  ];
}

function computeAircraftSize(
  view: TerrainView,
  reference: TerrainReference,
  scale: number,
  offset: [number, number, number],
  meshRadius: number
): { world: number; enu: number } {
  const viewWidth = Math.max(1e-6, view.bounds.right - view.bounds.left);
  const pixelsPerWorldUnit = view.viewportWidth / viewWidth;
  let screenSize = AIRCRAFT_SCREEN_SIZE;
  if (view.zoom < AIRCRAFT_FULL_SIZE_ZOOM) {
    const t = (view.zoom - 4) / (AIRCRAFT_FULL_SIZE_ZOOM - 4);
    screenSize = AIRCRAFT_MIN_SIZE + (AIRCRAFT_SCREEN_SIZE - AIRCRAFT_MIN_SIZE) * Math.max(0, t);
  }
  const aircraftWorld = screenSize / Math.max(1, pixelsPerWorldUnit);
  const leftPos = projectTesseraToEnu(
    view.centerX - viewWidth / 2,
    view.centerY,
    0,
    reference,
    scale,
    offset
  );
  const rightPos = projectTesseraToEnu(
    view.centerX + viewWidth / 2,
    view.centerY,
    0,
    reference,
    scale,
    offset
  );
  const viewWidthEnu = Math.hypot(rightPos[0] - leftPos[0], rightPos[1] - leftPos[1]);
  const scaleFactor = viewWidthEnu / viewWidth;
  const size = aircraftWorld * scaleFactor;
  return {
    world: aircraftWorld,
    enu: clamp(size, meshRadius * 0.002, meshRadius * 0.05),
  };
}

function computeClipRects(bounds: { left: number; right: number; top: number; bottom: number }): Array<[number, number, number, number]> {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width >= 1 || height >= 1) return [];
  const wrap01 = (value: number) => ((value % 1) + 1) % 1;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const top = clamp01(bounds.top);
  const bottom = clamp01(bounds.bottom);
  const left = bounds.left;
  const right = bounds.right;
  if (left <= right) {
    return [[wrap01(left), top, wrap01(right), bottom]];
  }
  return [
    [0, top, wrap01(right), bottom],
    [wrap01(left), top, 1, bottom],
  ];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function computeViewWidth(bounds: { left: number; right: number }): number {
  const width = bounds.right - bounds.left;
  if (width >= 0) return width;
  return 1 + width;
}

function distanceToClipRects(
  x: number,
  y: number,
  rects: Array<[number, number, number, number]>
): number {
  if (rects.length === 0) return 0;
  const wrap01 = (value: number) => ((value % 1) + 1) % 1;
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const xx = wrap01(x);
  const yy = clamp01(y);
  let best = Infinity;
  for (const rect of rects) {
    const left = rect[0];
    const top = rect[1];
    const right = rect[2];
    const bottom = rect[3];
    if (xx < left || xx > right || yy < top || yy > bottom) continue;
    const dist = Math.min(xx - left, right - xx, yy - top, bottom - yy);
    if (dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : 0;
}

function buildGlobalHeightSampler(mesh: TerrainMesh): HeightSampler {
  const coords = mesh.tesseraCoords;
  const positions = mesh.positions;
  const indices = mesh.indices;
  const gridSize = 128;
  const cellSize = 1 / gridSize;
  const grid: number[][] = Array.from({ length: gridSize * gridSize }, () => []);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] ?? 0;
    const i1 = indices[i + 1] ?? 0;
    const i2 = indices[i + 2] ?? 0;
    const x0 = coords[i0 * 2] ?? 0;
    const y0 = coords[i0 * 2 + 1] ?? 0;
    const x1 = coords[i1 * 2] ?? 0;
    const y1 = coords[i1 * 2 + 1] ?? 0;
    const x2 = coords[i2 * 2] ?? 0;
    const y2 = coords[i2 * 2 + 1] ?? 0;

    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);

    const startX = Math.max(0, Math.floor(minX / cellSize));
    const endX = Math.min(gridSize - 1, Math.floor(maxX / cellSize));
    const startY = Math.max(0, Math.floor(minY / cellSize));
    const endY = Math.min(gridSize - 1, Math.floor(maxY / cellSize));

    for (let gy = startY; gy <= endY; gy++) {
      for (let gx = startX; gx <= endX; gx++) {
        grid[gy * gridSize + gx]!.push(i);
      }
    }
  }

  return {
    sample: (x: number, y: number) => {
      const wrap01 = (value: number) => ((value % 1) + 1) % 1;
      const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
      const xx = wrap01(x);
      const yy = clamp01(y);
      const gx = Math.max(0, Math.min(gridSize - 1, Math.floor(xx / cellSize)));
      const gy = Math.max(0, Math.min(gridSize - 1, Math.floor(yy / cellSize)));
      const cell = grid[gy * gridSize + gx];
      if (!cell) return null;

      for (const triOffset of cell) {
        const i0 = indices[triOffset] ?? 0;
        const i1 = indices[triOffset + 1] ?? 0;
        const i2 = indices[triOffset + 2] ?? 0;
        const x0 = coords[i0 * 2] ?? 0;
        const y0 = coords[i0 * 2 + 1] ?? 0;
        const x1 = coords[i1 * 2] ?? 0;
        const y1 = coords[i1 * 2 + 1] ?? 0;
        const x2 = coords[i2 * 2] ?? 0;
        const y2 = coords[i2 * 2 + 1] ?? 0;
        const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(denom) < 1e-12) continue;
        const w0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / denom;
        const w1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;

        const z0 = positions[i0 * 3 + 2] ?? 0;
        const z1 = positions[i1 * 3 + 2] ?? 0;
        const z2 = positions[i2 * 3 + 2] ?? 0;
        return w0 * z0 + w1 * z1 + w2 * z2;
      }
      return null;
    },
  };
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

function resolveTileUrl(layer: TerrainLayer & { baseUrl: string; accessToken: string }, x: number, y: number, zoom: number): string {
  const tileTemplate = layer.tiles[0] ?? "";
  const resolvedTemplate = tileTemplate
    .replace("{z}", `${zoom}`)
    .replace("{x}", `${x}`)
    .replace("{y}", `${y}`)
    .replace("{version}", "1.0")
    .replace("{ext}", "terrain");
  const baseUrl = new URL(layer.baseUrl);
  const resolvedUrl = new URL(resolvedTemplate, baseUrl).toString();
  return appendAccessToken(resolvedUrl, layer.accessToken);
}

async function loadTerrainMesh(
  token: string,
  lat: number,
  lon: number,
  zoom: number,
  viewBounds?: LonLatBounds,
  layerOverride?: TerrainLayer & { baseUrl: string; accessToken: string },
  referenceOverride?: { lat: number; lon: number },
  originOffset?: [number, number, number],
  tileCoordsOverride?: Array<{ x: number; y: number }>
): Promise<TerrainMesh> {
  const layer = layerOverride ?? await fetchIonLayer(token);
  const scheme = layer.scheme ?? "tms";
  const projection = layer.projection ?? "EPSG:4326";

  const { xTiles, yTiles } = tileCounts(projection, zoom);
  const { x: centerTileX, y: centerTileY } = lonLatToTileXY(lon, lat, zoom, projection, scheme);
  const referenceLon = referenceOverride?.lon ?? lon;
  const referenceLat = referenceOverride?.lat ?? lat;
  const centerECEF = lonLatHeightToECEF(referenceLon, referenceLat, 0);
  const refLon = (referenceLon * Math.PI) / 180;
  const refLat = (referenceLat * Math.PI) / 180;

  const tileCoords: { x: number; y: number }[] = [];
  if (tileCoordsOverride && tileCoordsOverride.length > 0) {
    for (const coord of tileCoordsOverride) {
      if (coord.y < 0 || coord.y >= yTiles) continue;
      const wrappedX = ((coord.x % xTiles) + xTiles) % xTiles;
      tileCoords.push({ x: wrappedX, y: coord.y });
    }
  } else if (viewBounds) {
    const range = computeTileRangeFromBounds(viewBounds, zoom, projection, scheme);
    for (let y = range.minY; y <= range.maxY; y++) {
      if (y < 0 || y >= range.yTiles) continue;
      for (let x = range.minX; x <= range.maxX; x++) {
        const wrappedX = ((x % range.xTiles) + range.xTiles) % range.xTiles;
        tileCoords.push({ x: wrappedX, y });
      }
    }
  } else {
    for (let dy = -TILE_RANGE; dy <= TILE_RANGE; dy++) {
      const y = centerTileY + dy;
      if (y < 0 || y >= yTiles) continue;
      for (let dx = -TILE_RANGE; dx <= TILE_RANGE; dx++) {
        const x = ((centerTileX + dx) % xTiles + xTiles) % xTiles;
        tileCoords.push({ x, y });
      }
    }
  }

  const tileKey = (x: number, y: number) => `${x},${y}`;
  const tileSet = new Set(tileCoords.map((coord) => tileKey(coord.x, coord.y)));
  const wrapTileX = (x: number) => ((x % xTiles) + xTiles) % xTiles;

  const heightScale = 1.3;
  const scale = 1 / 1000;

  const tileMeshes: Array<DecodedTile | null> = await Promise.all(tileCoords.map(async (coord) => {
    try {
      const tileUrl = resolveTileUrl(layer, coord.x, coord.y, zoom);
      const response = await fetch(tileUrl);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      const view = new DataView(buffer);
      const decoded = parseQuantizedMesh(view);
      const bounds = tileBounds(coord.x, coord.y, zoom, projection, scheme);
      const westFallback: number[] = [];
      const eastFallback: number[] = [];
      const southFallback: number[] = [];
      const northFallback: number[] = [];
      if (
        decoded.westIndices.length === 0 ||
        decoded.eastIndices.length === 0 ||
        decoded.southIndices.length === 0 ||
        decoded.northIndices.length === 0
      ) {
        for (let i = 0; i < decoded.vertexCount; i++) {
          const u = decoded.u[i] ?? 0;
          const v = decoded.v[i] ?? 0;
          if (u === 0) westFallback.push(i);
          if (u === QUANTIZED_MAX) eastFallback.push(i);
          if (v === 0) southFallback.push(i);
          if (v === QUANTIZED_MAX) northFallback.push(i);
        }
        westFallback.sort((a, b) => (decoded.v[a] ?? 0) - (decoded.v[b] ?? 0));
        eastFallback.sort((a, b) => (decoded.v[a] ?? 0) - (decoded.v[b] ?? 0));
        southFallback.sort((a, b) => (decoded.u[a] ?? 0) - (decoded.u[b] ?? 0));
        northFallback.sort((a, b) => (decoded.u[a] ?? 0) - (decoded.u[b] ?? 0));
      }
      const west = decoded.westIndices.length > 0 ? decoded.westIndices : westFallback;
      const east = decoded.eastIndices.length > 0 ? decoded.eastIndices : eastFallback;
      const south = decoded.southIndices.length > 0 ? decoded.southIndices : southFallback;
      const north = decoded.northIndices.length > 0 ? decoded.northIndices : northFallback;

      const westX = wrapTileX(coord.x - 1);
      const eastX = wrapTileX(coord.x + 1);
      const northY = scheme === "tms" ? coord.y + 1 : coord.y - 1;
      const southY = scheme === "tms" ? coord.y - 1 : coord.y + 1;
      const hasWest = tileSet.has(tileKey(westX, coord.y));
      const hasEast = tileSet.has(tileKey(eastX, coord.y));
      const hasNorth = northY >= 0 && northY < yTiles && tileSet.has(tileKey(coord.x, northY));
      const hasSouth = southY >= 0 && southY < yTiles && tileSet.has(tileKey(coord.x, southY));

      const edgeSet = new Set<number>();
      for (const idx of west) edgeSet.add(idx);
      for (const idx of east) edgeSet.add(idx);
      for (const idx of south) edgeSet.add(idx);
      for (const idx of north) edgeSet.add(idx);
      const edgeIndices = new Uint32Array(edgeSet.size);
      let edgeWrite = 0;
      for (const idx of edgeSet) {
        edgeIndices[edgeWrite++] = idx;
      }

      const skirtEdges: Array<ArrayLike<number>> = [];
      if (!hasWest) skirtEdges.push(west);
      if (!hasSouth) skirtEdges.push(south);
      if (!hasEast) skirtEdges.push(east);
      if (!hasNorth) skirtEdges.push(north);

      const skirtVertexCount = skirtEdges.reduce((sum, edge) => sum + edge.length, 0);
      const skirtIndexCount = skirtEdges.reduce(
        (sum, edge) => sum + Math.max(0, edge.length - 1) * 6,
        0
      );
      const totalVertexCount = decoded.vertexCount + skirtVertexCount;
      const positions = new Float32Array(totalVertexCount * 3);
      const tesseraCoords = new Float32Array(totalVertexCount * 2);
      const skirtMask = new Float32Array(totalVertexCount);
      const heightRange = decoded.maxHeight - decoded.minHeight;
      const skirtHeight = Math.max(30, heightRange * 0.1);
      const skirtDepth = skirtHeight * scale;
      const tesseraBounds = tileTesseraBounds(coord.x, coord.y, zoom, projection, scheme);

      for (let i = 0; i < decoded.vertexCount; i++) {
        const u = (decoded.u[i] ?? 0) / QUANTIZED_MAX;
        const v = (decoded.v[i] ?? 0) / QUANTIZED_MAX;
        const h = (decoded.h[i] ?? 0) / QUANTIZED_MAX;

        let lonDeg = 0;
        let latDeg = 0;
        if (projection === "EPSG:3857") {
          const mercX = bounds.west + u * (bounds.east - bounds.west);
          const mercY = bounds.south + v * (bounds.north - bounds.south);
          const lonLat = mercatorToLonLat(mercX, mercY);
          lonDeg = lonLat.lonDeg;
          latDeg = lonLat.latDeg;
        } else {
          lonDeg = bounds.west + u * (bounds.east - bounds.west);
          latDeg = bounds.south + v * (bounds.north - bounds.south);
        }
        const height = decoded.minHeight + h * heightRange * heightScale;

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
        const tessera = lonLatToTessera(lonDeg, latDeg);
        tesseraCoords[i * 2] = tessera.x;
        tesseraCoords[i * 2 + 1] = tessera.y;
      }

      const indices = new Uint32Array(decoded.indices.length + skirtIndexCount);
      indices.set(decoded.indices, 0);
      let indexOffset = decoded.indices.length;

      let skirtOffset = decoded.vertexCount;
      const addSkirt = (edge: ArrayLike<number>) => {
        if (edge.length < 2) return;
        const skirtIndices = new Uint32Array(edge.length);
        for (let i = 0; i < edge.length; i++) {
          const base = edge[i] ?? 0;
          const baseOffset = base * 3;
          const skirtIndex = skirtOffset++;
          skirtIndices[i] = skirtIndex;
          skirtMask[skirtIndex] = 1;
          const skirtBase = skirtIndex * 3;
          positions[skirtBase] = positions[baseOffset] ?? 0;
          positions[skirtBase + 1] = positions[baseOffset + 1] ?? 0;
          positions[skirtBase + 2] = (positions[baseOffset + 2] ?? 0) - skirtDepth;
          const tessBase = base * 2;
          const tessSkirt = skirtIndex * 2;
          tesseraCoords[tessSkirt] = tesseraCoords[tessBase] ?? 0;
          tesseraCoords[tessSkirt + 1] = tesseraCoords[tessBase + 1] ?? 0;
        }
        for (let i = 0; i < edge.length - 1; i++) {
          const v0 = edge[i] ?? 0;
          const v1 = edge[i + 1] ?? 0;
          const s0 = skirtIndices[i] ?? 0;
          const s1 = skirtIndices[i + 1] ?? 0;
          indices[indexOffset++] = v0;
          indices[indexOffset++] = v1;
          indices[indexOffset++] = s0;
          indices[indexOffset++] = v1;
          indices[indexOffset++] = s1;
          indices[indexOffset++] = s0;
        }
      };

      for (const edge of skirtEdges) {
        addSkirt(edge);
      }

      const edgeDistance = new Float32Array(totalVertexCount);
      for (let i = 0; i < totalVertexCount; i++) {
        const tx = tesseraCoords[i * 2] ?? 0;
        const ty = tesseraCoords[i * 2 + 1] ?? 0;
        let dist = Number.POSITIVE_INFINITY;
        if (!hasWest) dist = Math.min(dist, tx - tesseraBounds.minX);
        if (!hasEast) dist = Math.min(dist, tesseraBounds.maxX - tx);
        if (!hasNorth) dist = Math.min(dist, ty - tesseraBounds.minY);
        if (!hasSouth) dist = Math.min(dist, tesseraBounds.maxY - ty);
        edgeDistance[i] = dist;
      }

      return { positions, indices, tesseraCoords, skirtMask, edgeIndices, edgeDistance } satisfies DecodedTile;
    } catch {
      return null;
    }
  }));

  const validTiles = tileMeshes.filter((tile): tile is NonNullable<typeof tile> => tile !== null);
  if (validTiles.length === 0) {
    throw new Error("Failed to fetch terrain tiles");
  }

  const totalVertices = validTiles.reduce((sum, tile) => sum + tile.positions.length / 3, 0);
  if (totalVertices > MAX_TOTAL_VERTICES) {
    throw new Error(`Terrain preview too large (${totalVertices} vertices)`);
  }

  const totalIndices = validTiles.reduce((sum, tile) => sum + tile.indices.length, 0);
  const positions = new Float32Array(totalVertices * 3);
  const tesseraCoords = new Float32Array(totalVertices * 2);
  const indices = new Uint32Array(totalIndices);
  const skirtMask = new Float32Array(totalVertices);
  const edgeDistance = new Float32Array(totalVertices);
  const edgeGroups = new Map<
    string,
    { sumX: number; sumY: number; sumZ: number; count: number; indices: number[] }
  >();

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const tile of validTiles) {
    positions.set(tile.positions, vertexOffset * 3);
    tesseraCoords.set(tile.tesseraCoords, vertexOffset * 2);
    skirtMask.set(tile.skirtMask, vertexOffset);
    edgeDistance.set(tile.edgeDistance, vertexOffset);
    for (let i = 0; i < tile.indices.length; i++) {
      indices[indexOffset + i] = (tile.indices[i] ?? 0) + vertexOffset;
    }
    for (let i = 0; i < tile.edgeIndices.length; i++) {
      const localIndex = tile.edgeIndices[i] ?? 0;
      const globalIndex = vertexOffset + localIndex;
      const tessBase = globalIndex * 2;
      const keyX = Math.round((tesseraCoords[tessBase] ?? 0) * 1e7);
      const keyY = Math.round((tesseraCoords[tessBase + 1] ?? 0) * 1e7);
      const key = `${keyX},${keyY}`;
      const base = globalIndex * 3;
      const entry = edgeGroups.get(key) ?? { sumX: 0, sumY: 0, sumZ: 0, count: 0, indices: [] };
      entry.sumX += positions[base] ?? 0;
      entry.sumY += positions[base + 1] ?? 0;
      entry.sumZ += positions[base + 2] ?? 0;
      entry.count += 1;
      entry.indices.push(globalIndex);
      edgeGroups.set(key, entry);
    }
    indexOffset += tile.indices.length;
    vertexOffset += tile.positions.length / 3;
  }

  for (const entry of edgeGroups.values()) {
    if (entry.count < 2) continue;
    const avgX = entry.sumX / entry.count;
    const avgY = entry.sumY / entry.count;
    const avgZ = entry.sumZ / entry.count;
    for (const idx of entry.indices) {
      const base = idx * 3;
      positions[base] = avgX;
      positions[base + 1] = avgY;
      positions[base + 2] = avgZ;
    }
  }

  let minX = positions[0] ?? 0;
  let maxX = minX;
  let minY = positions[1] ?? 0;
  let maxY = minY;
  let minZ = positions[2] ?? 0;
  let maxZ = minZ;

  for (let i = 0; i < positions.length; i += 3) {
    const xVal = positions[i] ?? 0;
    const yVal = positions[i + 1] ?? 0;
    const zVal = positions[i + 2] ?? 0;
    minX = Math.min(minX, xVal);
    maxX = Math.max(maxX, xVal);
    minY = Math.min(minY, yVal);
    maxY = Math.max(maxY, yVal);
    minZ = Math.min(minZ, zVal);
    maxZ = Math.max(maxZ, zVal);
  }

  const meshCenterX = (minX + maxX) / 2;
  const meshCenterY = (minY + maxY) / 2;
  const meshCenterZ = (minZ + maxZ) / 2;
  const halfWidth = (maxX - minX) / 2;
  const halfHeight = (maxY - minY) / 2;

  const usedOffset: [number, number, number] = originOffset ?? [meshCenterX, meshCenterY, meshCenterZ];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) - usedOffset[0];
    positions[i + 1] = (positions[i + 1] ?? 0) - usedOffset[1];
    positions[i + 2] = (positions[i + 2] ?? 0) - usedOffset[2];
  }

  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const xVal = positions[i] ?? 0;
    const yVal = positions[i + 1] ?? 0;
    const zVal = positions[i + 2] ?? 0;
    radius = Math.max(radius, Math.hypot(xVal, yVal, zVal));
  }

  const normals = computeNormals(positions, indices);
  for (let i = 0; i < skirtMask.length; i++) {
    if ((skirtMask[i] ?? 0) > 0) {
      const base = i * 3;
      normals[base] = 0;
      normals[base + 1] = 0;
      normals[base + 2] = 1;
    }
  }

  const terrainReference: TerrainReference = {
    lon: referenceLon,
    lat: referenceLat,
    lonRad: refLon,
    latRad: refLat,
    ecef: [centerECEF[0], centerECEF[1], centerECEF[2]],
  };
  const offset: [number, number, number] = usedOffset;

  return {
    positions,
    normals,
    indices,
    tesseraCoords,
    skirtMask,
    edgeDistance,
    radius,
    halfWidth,
    halfHeight,
    reference: terrainReference,
    offset,
    scale,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function projectToScreen(
  position: [number, number, number],
  mvp: Float32Array,
  width: number,
  height: number
): { x: number; y: number } | null {
  const x = position[0];
  const y = position[1];
  const z = position[2];
  const clipX = (mvp[0] ?? 0) * x + (mvp[4] ?? 0) * y + (mvp[8] ?? 0) * z + (mvp[12] ?? 0);
  const clipY = (mvp[1] ?? 0) * x + (mvp[5] ?? 0) * y + (mvp[9] ?? 0) * z + (mvp[13] ?? 0);
  const clipW = (mvp[3] ?? 0) * x + (mvp[7] ?? 0) * y + (mvp[11] ?? 0) * z + (mvp[15] ?? 0);
  if (clipW <= 0) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

export function startTerrainPreview(
  canvas: HTMLCanvasElement
): {
  stop: () => void;
  resize: () => void;
  setView: (view: TerrainView) => void;
  setAircraft: (aircraft: Aircraft[]) => void;
  setAreas: (state: EditableAreasState | null) => void;
} {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) {
    throw new Error("WebGL2 not supported for terrain preview");
  }

  const terrainHeader = document.getElementById("terrain-panel-header");
  const labelCanvas = document.getElementById("terrain-labels") as HTMLCanvasElement | null;
  const labelCtx = labelCanvas?.getContext("2d") ?? null;
  const labelPlacer = new LabelPlacer({
    fontSize: LABEL_FONT_SIZE,
    charWidth: LABEL_CHAR_WIDTH,
    calloutThreshold: 4,
    maxCalloutLabels: 5,
  });
  if (labelCtx) {
    labelPlacer.setMeasureFunction((text, fontSize) => {
      labelCtx.font = `600 ${fontSize}px Arial`;
      return labelCtx.measureText(text).width;
    });
  }

  const TERRAIN_CENTER = { lat: 37.7749, lon: -122.4194 };
  const TERRAIN_ZOOM = 10;

  const token =
    (import.meta as { env?: { VITE_CESIUM_TOKEN?: string } }).env?.VITE_CESIUM_TOKEN ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYzA4YzQzZS05MGQzLTRiYjItOTZlOC0xZjQ2NjYxNDNlMWMiLCJpZCI6MjE0Njg1LCJpYXQiOjE3MTU1NzIxOTB9.HH1wsTeS17mag5SRH7eZF6gMtf_IEWO6P1yWZVjxRO0";

  const program = createProgram(gl);
  const positionLoc = gl.getAttribLocation(program, "a_position");
  const normalLoc = gl.getAttribLocation(program, "a_normal");
  const uvLoc = gl.getAttribLocation(program, "a_uv");
  const skirtLoc = gl.getAttribLocation(program, "a_skirt");
  const tesseraLoc = gl.getAttribLocation(program, "a_tessera");
  const mvpLoc = gl.getUniformLocation(program, "u_mvp");
  const modelLoc = gl.getUniformLocation(program, "u_model");
  const lightLoc = gl.getUniformLocation(program, "u_lightDir");
  const lightMixLoc = gl.getUniformLocation(program, "u_lightMix");
  const clipCountLoc = gl.getUniformLocation(program, "u_clipCount");
  const clipRect0Loc = gl.getUniformLocation(program, "u_clipRect0");
  const clipRect1Loc = gl.getUniformLocation(program, "u_clipRect1");
  const colorLoc = gl.getUniformLocation(program, "u_color");
  const textureLoc = gl.getUniformLocation(program, "u_texture");
  const textureMixLoc = gl.getUniformLocation(program, "u_textureMix");
  const skirtCutLoc = gl.getUniformLocation(program, "u_skirtCut");

  const aircraftProgram = createProgramWithSource(gl, AIRCRAFT_VERTEX_SHADER, AIRCRAFT_FRAGMENT_SHADER);
  const aircraftShapeLoc = gl.getAttribLocation(aircraftProgram, "a_shape");
  const aircraftNormalLoc = gl.getAttribLocation(aircraftProgram, "a_normal");
  const aircraftPosLoc = gl.getAttribLocation(aircraftProgram, "a_instancePos");
  const aircraftHeadingLoc = gl.getAttribLocation(aircraftProgram, "a_heading");
  const aircraftSizeLoc = gl.getAttribLocation(aircraftProgram, "a_size");
  const aircraftColorLoc = gl.getAttribLocation(aircraftProgram, "a_color");
  const aircraftMvpLoc = gl.getUniformLocation(aircraftProgram, "u_mvp");
  const aircraftLightLoc = gl.getUniformLocation(aircraftProgram, "u_lightDir");

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const nbo = gl.createBuffer();
  const uvbo = gl.createBuffer();
  const skbo = gl.createBuffer();
  const tbo = gl.createBuffer();
  const fillIbo = gl.createBuffer();
  const fallbackTexture = gl.createTexture();
  const aircraftVao = gl.createVertexArray();
  const aircraftShapeBuffer = gl.createBuffer();
  const aircraftNormalBuffer = gl.createBuffer();
  const aircraftInstanceBuffer = gl.createBuffer();
  const aircraftInstanceData = new Float32Array(AIRCRAFT_MAX_INSTANCES * AIRCRAFT_INSTANCE_STRIDE);

  let detailIndexCount = 0;
  let detailIndexType: number = gl.UNSIGNED_SHORT;
  let detailMeshRadius = 1;
  let detailMeshHalfWidth = 0;
  let detailMeshHalfHeight = 0;
  let detailMeshReady = false;
  let detailAtlas: RasterAtlas | null = null;
  let detailTextureReady = false;
  const lodMeshes = new Map<number, LodMeshState>();
  let lodMeshOrder: LodMeshState[] = [];

  const createLodState = (): LodMeshState => ({
    zoom: 0,
    vao: gl.createVertexArray(),
    vbo: gl.createBuffer(),
    nbo: gl.createBuffer(),
    uvbo: gl.createBuffer(),
    skbo: gl.createBuffer(),
    tbo: gl.createBuffer(),
    ibo: gl.createBuffer(),
    indexCount: 0,
    indexType: gl.UNSIGNED_SHORT,
    meshReady: false,
    atlas: null,
    textureReady: false,
    loadId: 0,
    meshData: null,
    basePositions: null,
  });
  const getLodState = (zoom: number): LodMeshState => {
    const existing = lodMeshes.get(zoom);
    if (existing) return existing;
    const state = createLodState();
    state.zoom = zoom;
    lodMeshes.set(zoom, state);
    return state;
  };
  const deleteLodState = (state: LodMeshState) => {
    if (state.vbo) gl.deleteBuffer(state.vbo);
    if (state.nbo) gl.deleteBuffer(state.nbo);
    if (state.uvbo) gl.deleteBuffer(state.uvbo);
    if (state.skbo) gl.deleteBuffer(state.skbo);
    if (state.tbo) gl.deleteBuffer(state.tbo);
    if (state.ibo) gl.deleteBuffer(state.ibo);
    if (state.vao) gl.deleteVertexArray(state.vao);
    if (state.atlas?.texture) gl.deleteTexture(state.atlas.texture);
  };
  let animationId: number | null = null;
  let azimuth = Math.PI;
  let elevation = 0.6;
  let distance = 1;
  let minDistance = 0.1;
  let maxDistance = 10;
  let isDragging = false;
  let dragMode: "orbit" | "pan" = "orbit";
  let lastX = 0;
  let lastY = 0;
  const target: [number, number, number] = [0, 0, 0];
  let terrainLayer: (TerrainLayer & { baseUrl: string; accessToken: string }) | null = null;
  let pendingView: TerrainView | null = null;
  let lastView: TerrainView | null = null;
  let currentView: TerrainView | null = null;
  let viewDebounceId: number | null = null;
  let loadId = 0;
  let userAdjustedCamera = false;
  let aircraftList: Aircraft[] = [];
  let areasState: EditableAreasState | null = null;
  let detailMeshData: TerrainMesh | null = null;
  let detailBasePositions: Float32Array | null = null;
  let detailBlendView: TerrainView | null = null;
  let detailClipBounds: { left: number; right: number; top: number; bottom: number } | null = null;
  let lodHeightSampler: HeightSampler | null = null;
  let meshReference: TerrainReference | null = null;
  let meshOffset: [number, number, number] = [0, 0, 0];
  let meshScale = 1;
  let autoFitPending = false;

  if (fallbackTexture) {
    gl.bindTexture(gl.TEXTURE_2D, fallbackTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  const aircraftReady = Boolean(aircraftVao && aircraftShapeBuffer && aircraftNormalBuffer && aircraftInstanceBuffer);
  if (aircraftReady) {
    gl.bindVertexArray(aircraftVao);

    gl.bindBuffer(gl.ARRAY_BUFFER, aircraftShapeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, AIRCRAFT_SHAPE.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aircraftShapeLoc);
    gl.vertexAttribPointer(aircraftShapeLoc, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aircraftShapeLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, aircraftNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, AIRCRAFT_SHAPE.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aircraftNormalLoc);
    gl.vertexAttribPointer(aircraftNormalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aircraftNormalLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, aircraftInstanceBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      aircraftInstanceData.byteLength,
      gl.DYNAMIC_DRAW
    );
    const stride = AIRCRAFT_INSTANCE_STRIDE * 4;
    let offset = 0;
    gl.enableVertexAttribArray(aircraftPosLoc);
    gl.vertexAttribPointer(aircraftPosLoc, 3, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(aircraftPosLoc, 1);
    offset += 12;

    gl.enableVertexAttribArray(aircraftHeadingLoc);
    gl.vertexAttribPointer(aircraftHeadingLoc, 1, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(aircraftHeadingLoc, 1);
    offset += 4;

    gl.enableVertexAttribArray(aircraftSizeLoc);
    gl.vertexAttribPointer(aircraftSizeLoc, 1, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(aircraftSizeLoc, 1);
    offset += 4;

    gl.enableVertexAttribArray(aircraftColorLoc);
    gl.vertexAttribPointer(aircraftColorLoc, 3, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(aircraftColorLoc, 1);

    gl.bindVertexArray(null);
  }

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
    if (labelCanvas && (labelCanvas.width !== width || labelCanvas.height !== height)) {
      labelCanvas.width = width;
      labelCanvas.height = height;
    }
  };

  const getLayer = async () => {
    if (terrainLayer) return terrainLayer;
    terrainLayer = await fetchIonLayer(token);
    return terrainLayer;
  };

  const applyMesh = (mesh: TerrainMesh, tileZoom: number) => {
    detailIndexCount = mesh.indices.length;
    detailMeshRadius = Math.max(mesh.radius, 0.001);
    detailMeshHalfWidth = mesh.halfWidth;
    detailMeshHalfHeight = mesh.halfHeight;
    meshReference = mesh.reference;
    meshOffset = mesh.offset;
    meshScale = mesh.scale;
    minDistance = detailMeshRadius * 0.25;
    maxDistance = detailMeshRadius * 10;
    const shouldAutoFit = autoFitPending || !userAdjustedCamera;
    if (!detailMeshReady || shouldAutoFit) {
      const aspect = canvas.width > 0 ? canvas.width / Math.max(1, canvas.height) : 1;
      const tanHalfFov = Math.tan(FOV / 2);
      const fitHeight = detailMeshHalfHeight / Math.max(1e-6, tanHalfFov);
      const fitWidth = detailMeshHalfWidth / Math.max(1e-6, tanHalfFov * aspect);
      distance = Math.max(fitHeight, fitWidth) * 1.08;
    } else {
      distance = clamp(distance, minDistance, maxDistance);
    }
    autoFitPending = false;
    const needsUint32 = mesh.positions.length / 3 > 65535;
    detailIndexType = needsUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const indexData = needsUint32 ? mesh.indices : new Uint16Array(mesh.indices);

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

    const initialUvs = new Float32Array((mesh.positions.length / 3) * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, initialUvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, skbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.skirtMask, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(skirtLoc);
    gl.vertexAttribPointer(skirtLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, tbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.tesseraCoords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(tesseraLoc);
    gl.vertexAttribPointer(tesseraLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fillIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    detailMeshReady = true;

    void (async () => {
      const rasterZoom = Math.max(0, tileZoom + RASTER_ZOOM_OFFSET);
      const atlasResult = await buildRasterAtlas(gl, mesh.tesseraCoords, rasterZoom);
      if (!atlasResult) return;
      if (detailAtlas?.texture) gl.deleteTexture(detailAtlas.texture);
      detailAtlas = atlasResult;
      const uvs = computeAtlasUVs(mesh.tesseraCoords, atlasResult);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      detailTextureReady = true;
    })();
  };

  const applyLodMesh = (lodMesh: LodMeshState, mesh: TerrainMesh, tileZoom: number) => {
    lodMesh.indexCount = mesh.indices.length;
    lodMesh.meshReady = false;
    const needsUint32 = mesh.positions.length / 3 > 65535;
    lodMesh.indexType = needsUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const indexData = needsUint32 ? mesh.indices : new Uint16Array(mesh.indices);

    gl.bindVertexArray(lodMesh.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(normalLoc);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

    const initialUvs = new Float32Array((mesh.positions.length / 3) * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.uvbo);
    gl.bufferData(gl.ARRAY_BUFFER, initialUvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.skbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.skirtMask, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(skirtLoc);
    gl.vertexAttribPointer(skirtLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.tbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.tesseraCoords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(tesseraLoc);
    gl.vertexAttribPointer(tesseraLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lodMesh.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    lodMesh.meshReady = true;
    lodMesh.meshData = mesh;
    lodMesh.basePositions = mesh.positions.slice();

    void (async () => {
      const rasterZoom = Math.max(0, tileZoom + RASTER_ZOOM_OFFSET);
      const atlasResult = await buildRasterAtlas(gl, mesh.tesseraCoords, rasterZoom);
      if (!atlasResult) return;
      if (lodMesh.atlas?.texture) gl.deleteTexture(lodMesh.atlas.texture);
      lodMesh.atlas = atlasResult;
      const uvs = computeAtlasUVs(mesh.tesseraCoords, atlasResult);
      gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.uvbo);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      lodMesh.textureReady = true;
    })();
  };

  const loadDetail = async (
    centerLat: number,
    centerLon: number,
    tileZoom: number,
    bounds?: LonLatBounds
  ): Promise<TerrainMesh | null> => {
    const currentLoadId = ++loadId;
    try {
      const layer = await getLayer();
      const mesh = await loadTerrainMesh(token, centerLat, centerLon, tileZoom, bounds, layer);
      if (currentLoadId !== loadId) return null;
      detailTextureReady = false;
      autoFitPending = true;
      applyMesh(mesh, tileZoom);
      return mesh;
    } catch {
      // Keep prior mesh if new load fails.
    }
    return null;
  };

  const loadLodMeshes = async (
    center: { lon: number; lat: number },
    tileZoom: number,
    originOffset: [number, number, number],
    layer: TerrainLayer & { baseUrl: string; accessToken: string }
  ) => {
    const scheme = layer.scheme ?? "tms";
    const projection = layer.projection ?? "EPSG:4326";
    const reference: TerrainReference = {
      lon: center.lon,
      lat: center.lat,
      lonRad: (center.lon * Math.PI) / 180,
      latRad: (center.lat * Math.PI) / 180,
      ecef: lonLatHeightToECEF(center.lon, center.lat, 0),
    };
    const maxZoom = Math.max(LOD_MIN_ZOOM, tileZoom - LOD_DETAIL_ZOOM_GAP);
    const lodGroups = buildAdaptiveLodTiles(reference, maxZoom, projection, scheme);
    const activeZooms = new Set<number>();
    for (const [zoom, tiles] of lodGroups) {
      if (tiles.length > 0) activeZooms.add(zoom);
    }

    for (const [zoom, state] of lodMeshes.entries()) {
      if (!activeZooms.has(zoom)) {
        deleteLodState(state);
        lodMeshes.delete(zoom);
      }
    }

    lodMeshOrder = Array.from(activeZooms)
      .sort((a, b) => a - b)
      .map((zoom) => {
        const state = getLodState(zoom);
        state.zoom = zoom;
        return state;
      });

    await Promise.all(
      lodMeshOrder.map(async (lodMesh) => {
        const tiles = lodGroups.get(lodMesh.zoom);
        if (!tiles || tiles.length === 0) {
          lodMesh.meshReady = false;
          lodMesh.textureReady = false;
          lodMesh.meshData = null;
          lodMesh.basePositions = null;
          return;
        }
        const currentLoadId = ++lodMesh.loadId;
        try {
          const mesh = await loadTerrainMesh(
            token,
            center.lat,
            center.lon,
            lodMesh.zoom,
            undefined,
            layer,
            { lat: center.lat, lon: center.lon },
            originOffset,
            tiles
          );
          if (currentLoadId !== lodMesh.loadId) return;
          if (lodMeshes.get(lodMesh.zoom) !== lodMesh) return;
          lodMesh.textureReady = false;
          applyLodMesh(lodMesh, mesh, lodMesh.zoom);
        } catch {
          // Keep prior mesh if new load fails.
        }
      })
    );

    blendLodMeshes(projection);
  };

  const viewsEqual = (a: TerrainView, b: TerrainView) => {
    const epsilon = 1e-6;
    return (
      Math.abs(a.centerX - b.centerX) < epsilon &&
      Math.abs(a.centerY - b.centerY) < epsilon &&
      Math.abs(a.zoom - b.zoom) < epsilon &&
      Math.abs(a.viewportWidth - b.viewportWidth) < epsilon &&
      Math.abs(a.viewportHeight - b.viewportHeight) < epsilon &&
      Math.abs(a.bounds.left - b.bounds.left) < epsilon &&
      Math.abs(a.bounds.right - b.bounds.right) < epsilon &&
      Math.abs(a.bounds.top - b.bounds.top) < epsilon &&
      Math.abs(a.bounds.bottom - b.bounds.bottom) < epsilon
    );
  };

  const applyView = async (view: TerrainView) => {
    lodHeightSampler = null;
    detailClipBounds = null;
    const center = tesseraToLonLat(view.centerX, view.centerY);
    const west = tesseraToLonLat(view.bounds.left, view.centerY).lon;
    const east = tesseraToLonLat(view.bounds.right, view.centerY).lon;
    const north = tesseraToLonLat(view.centerX, view.bounds.top).lat;
    const south = tesseraToLonLat(view.centerX, view.bounds.bottom).lat;
    const tileZoom = Math.max(0, Math.floor(view.zoom));
    const lonLatBounds: LonLatBounds = {
      west,
      east,
      south,
      north,
    };
    const layer = await getLayer();
    const scheme = layer.scheme ?? "tms";
    const projection = layer.projection ?? "EPSG:4326";
    const range = computeTileRangeFromBounds(lonLatBounds, tileZoom, projection, scheme);
    const tilesWide = Math.max(1, range.maxX - range.minX + 1);
    const tilesHigh = Math.max(1, range.maxY - range.minY + 1);
    if (terrainHeader) {
      const total = tilesWide * tilesHigh;
      terrainHeader.textContent = `Terrain Preview · z${tileZoom} · ${tilesWide}x${tilesHigh} (${total})`;
    }
    const detailMesh = await loadDetail(center.lat, center.lon, tileZoom, lonLatBounds);
    if (detailMesh) {
      detailMeshData = detailMesh;
      detailBasePositions = detailMesh.positions.slice();
      detailBlendView = {
        centerX: view.centerX,
        centerY: view.centerY,
        zoom: view.zoom,
        viewportWidth: view.viewportWidth,
        viewportHeight: view.viewportHeight,
        bounds: { ...view.bounds },
      };
      const meshBounds = getTesseraBounds(detailMesh.tesseraCoords);
      const meshSpan = meshBounds.maxX - meshBounds.minX;
      const viewSpan = computeViewWidth(view.bounds);
      let left = meshBounds.minX;
      let right = meshBounds.maxX;
      if (meshSpan > 0.5 && viewSpan < 0.5) {
        left = meshBounds.maxX;
        right = meshBounds.minX;
      }
      detailClipBounds = {
        left,
        right,
        top: meshBounds.minY,
        bottom: meshBounds.maxY,
      };
      await loadLodMeshes(center, tileZoom, detailMesh.offset, layer);
    }
  };

  const setView = (view: TerrainView) => {
    currentView = view;
    if (lastView && viewsEqual(lastView, view)) return;
    lastView = {
      centerX: view.centerX,
      centerY: view.centerY,
      zoom: view.zoom,
      viewportWidth: view.viewportWidth,
      viewportHeight: view.viewportHeight,
      bounds: { ...view.bounds },
    };
    pendingView = lastView;
    if (viewDebounceId !== null) {
      window.clearTimeout(viewDebounceId);
    }
    viewDebounceId = window.setTimeout(() => {
      viewDebounceId = null;
      if (!pendingView) return;
      const next = pendingView;
      pendingView = null;
      void applyView(next);
    }, 150);
  };

  const setAircraft = (aircraft: Aircraft[]) => {
    aircraftList = aircraft;
  };

  const setAreas = (state: EditableAreasState | null) => {
    areasState = state;
  };

  const updateLodBuffers = (lodMesh: LodMeshState, mesh: TerrainMesh) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lodMesh.nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  };

  const blendMeshToCoarser = (
    mesh: TerrainMesh,
    basePositions: Float32Array,
    sampler: HeightSampler,
    blendWidth: number
  ) => {
    const positions = mesh.positions;
    const coords = mesh.tesseraCoords;
    const skirtMask = mesh.skirtMask;
    const edgeDistance = mesh.edgeDistance;
    const skirtEpsilon = Math.max(1e-6, mesh.radius * 1e-4);

    positions.set(basePositions);

    for (let i = 0; i < positions.length / 3; i++) {
      const dist = edgeDistance[i] ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(dist) || dist >= blendWidth) continue;
      const tx = coords[i * 2] ?? 0;
      const ty = coords[i * 2 + 1] ?? 0;
      const coarseZ = sampler.sample(tx, ty);
      if (coarseZ === null) continue;
      const zIndex = i * 3 + 2;
      if ((skirtMask[i] ?? 0) > 0) {
        positions[zIndex] = coarseZ - skirtEpsilon;
        continue;
      }
      const detailZ = positions[zIndex] ?? 0;
      const t = smoothstep(0, blendWidth, dist);
      positions[zIndex] = coarseZ * (1 - t) + detailZ * t;
    }

    const blendedNormals = computeNormals(positions, mesh.indices);
    for (let i = 0; i < skirtMask.length; i++) {
      if ((skirtMask[i] ?? 0) > 0) {
        const base = i * 3;
        blendedNormals[base] = 0;
        blendedNormals[base + 1] = 0;
        blendedNormals[base + 2] = 1;
      }
    }
    mesh.normals = blendedNormals;
  };

  const blendLodMeshes = (projection: string) => {
    if (lodMeshOrder.length === 0) {
      lodHeightSampler = null;
      return;
    }

    let coarseSampler: HeightSampler | null = null;
    for (const lodMesh of lodMeshOrder) {
      const mesh = lodMesh.meshData;
      const basePositions = lodMesh.basePositions;
      if (!mesh || !basePositions || !lodMesh.meshReady) {
        continue;
      }
      const blendWidth = coarseSampler
        ? (1 / Math.max(1, tileCounts(projection, lodMesh.zoom).xTiles)) * LOD_EDGE_BLEND_FRACTION
        : 0;
      if (coarseSampler && blendWidth > 0) {
        blendMeshToCoarser(mesh, basePositions, coarseSampler, blendWidth);
        updateLodBuffers(lodMesh, mesh);
      } else {
        mesh.positions.set(basePositions);
        mesh.normals = computeNormals(mesh.positions, mesh.indices);
        for (let i = 0; i < mesh.skirtMask.length; i++) {
          if ((mesh.skirtMask[i] ?? 0) > 0) {
            const base = i * 3;
            mesh.normals[base] = 0;
            mesh.normals[base + 1] = 0;
            mesh.normals[base + 2] = 1;
          }
        }
        updateLodBuffers(lodMesh, mesh);
      }
      coarseSampler = buildGlobalHeightSampler(mesh);
    }

    const lastMesh = lodMeshOrder[lodMeshOrder.length - 1]?.meshData ?? null;
    lodHeightSampler = lastMesh ? buildGlobalHeightSampler(lastMesh) : null;
    blendDetailToGlobal();
  };

  const blendDetailToGlobal = () => {
    if (
      !detailMeshData ||
      !detailBlendView ||
      !detailClipBounds ||
      !lodHeightSampler ||
      !detailMeshReady ||
      !detailBasePositions
    ) {
      return;
    }

    const mesh = detailMeshData;
    const positions = mesh.positions;
    const coords = mesh.tesseraCoords;
    const skirtMask = mesh.skirtMask;

    positions.set(detailBasePositions);

    const bounds = detailClipBounds;
    const clipWidth = computeViewWidth(bounds);
    const viewWidth = computeViewWidth(detailBlendView.bounds);
    const worldPerPixel = viewWidth / Math.max(1, detailBlendView.viewportWidth);
    const blendWidth = Math.min(clipWidth * 0.25, worldPerPixel * DETAIL_BLEND_BAND_PX);
    if (blendWidth <= 0) return;

    const clipRects = computeClipRects(bounds);
    if (clipRects.length === 0) return;
    const skirtEpsilon = Math.max(1e-6, mesh.radius * 1e-4);

    for (let i = 0; i < positions.length / 3; i++) {
      const tx = coords[i * 2] ?? 0;
      const ty = coords[i * 2 + 1] ?? 0;
      const dist = distanceToClipRects(tx, ty, clipRects);
      const globalZ = lodHeightSampler.sample(tx, ty);
      if (globalZ === null) continue;
      const zIndex = i * 3 + 2;
      if ((skirtMask[i] ?? 0) > 0) {
        positions[zIndex] = globalZ - skirtEpsilon;
        continue;
      }
      if (dist >= blendWidth) continue;
      const detailZ = positions[zIndex] ?? 0;
      const t = smoothstep(0, blendWidth, dist);
      positions[zIndex] = globalZ * (1 - t) + detailZ * t;
    }

    const blendedNormals = computeNormals(positions, mesh.indices);
    for (let i = 0; i < skirtMask.length; i++) {
      if ((skirtMask[i] ?? 0) > 0) {
        const base = i * 3;
        blendedNormals[base] = 0;
        blendedNormals[base + 1] = 0;
        blendedNormals[base + 2] = 1;
      }
    }
    mesh.normals = blendedNormals;

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, blendedNormals, gl.STATIC_DRAW);
  };

  void (async () => {
    const detailMesh = await loadDetail(TERRAIN_CENTER.lat, TERRAIN_CENTER.lon, TERRAIN_ZOOM);
    if (detailMesh) {
      const layer = await getLayer();
      const center = { lon: TERRAIN_CENTER.lon, lat: TERRAIN_CENTER.lat };
      const tesseraCenter = lonLatToTessera(center.lon, center.lat);
      const viewportWidth = Math.max(1, canvas.width);
      const viewportHeight = Math.max(1, canvas.height);
      const worldSize = TILE_SIZE * Math.pow(2, TERRAIN_ZOOM);
      const viewWidth = viewportWidth / worldSize;
      const viewHeight = viewportHeight / worldSize;
      const bounds = {
        left: tesseraCenter.x - viewWidth / 2,
        right: tesseraCenter.x + viewWidth / 2,
        top: tesseraCenter.y - viewHeight / 2,
        bottom: tesseraCenter.y + viewHeight / 2,
      };
      const view: TerrainView = {
        centerX: tesseraCenter.x,
        centerY: tesseraCenter.y,
        zoom: TERRAIN_ZOOM,
        viewportWidth,
        viewportHeight,
        bounds,
      };
      await loadLodMeshes(center, TERRAIN_ZOOM, detailMesh.offset, layer);
    }
  })();

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.lineWidth(1);

  canvas.style.touchAction = "none";
  const getEye = (): [number, number, number] => {
    const cosEl = Math.cos(elevation);
    const sinEl = Math.sin(elevation);
    const sinAz = Math.sin(azimuth);
    const cosAz = Math.cos(azimuth);
    return [
      target[0] + distance * cosEl * sinAz,
      target[1] + distance * cosEl * cosAz,
      target[2] + distance * sinEl,
    ];
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey) {
      dragMode = "pan";
    } else {
      dragMode = "orbit";
    }
    isDragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (dragMode === "orbit") {
      userAdjustedCamera = true;
      azimuth += dx * ORBIT_SPEED;
      elevation = clamp(elevation + dy * ORBIT_SPEED, MIN_ELEVATION, MAX_ELEVATION);
      return;
    }
    userAdjustedCamera = true;

    const eye = getEye();
    const dir: [number, number, number] = [
      target[0] - eye[0],
      target[1] - eye[1],
      target[2] - eye[2],
    ];
    const dirLen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dirNorm: [number, number, number] = [dir[0] / dirLen, dir[1] / dirLen, dir[2] / dirLen];
    const up: [number, number, number] = [0, 0, 1];
    const right: [number, number, number] = [
      dirNorm[1] * up[2] - dirNorm[2] * up[1],
      dirNorm[2] * up[0] - dirNorm[0] * up[2],
      dirNorm[0] * up[1] - dirNorm[1] * up[0],
    ];
    const rightLen = Math.hypot(right[0], right[1], right[2]) || 1;
    right[0] /= rightLen; right[1] /= rightLen; right[2] /= rightLen;
    const upVec: [number, number, number] = [
      right[1] * dirNorm[2] - right[2] * dirNorm[1],
      right[2] * dirNorm[0] - right[0] * dirNorm[2],
      right[0] * dirNorm[1] - right[1] * dirNorm[0],
    ];

    const pixelsToWorld = (distance * Math.tan(FOV / 2) * 2) / Math.max(1, canvas.height);
    const panX = -dx * pixelsToWorld * PAN_SPEED;
    const panY = dy * pixelsToWorld * PAN_SPEED;
    target[0] += right[0] * panX + upVec[0] * panY;
    target[1] += right[1] * panX + upVec[1] * panY;
    target[2] += right[2] * panX + upVec[2] * panY;
  };

  const onPointerUp = (event: PointerEvent) => {
    isDragging = false;
    canvas.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    const zoom = Math.exp(event.deltaY * 0.001);
    distance = clamp(distance * zoom, minDistance, maxDistance);
    userAdjustedCamera = true;
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContextMenu);

  const render = (time: number) => {
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (labelCtx && labelCanvas) {
      labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    }

    if (detailMeshReady) {
      const aspect = canvas.width / canvas.height;
      const near = Math.max(0.01, distance * 0.02);
      const far = Math.max(distance * 10, detailMeshRadius * 8);
      const projection = mat4Perspective(FOV, aspect, near, far);
      const view = mat4LookAt(getEye(), target, [0, 0, 1]);
      const model = mat4Identity();
      const mvp = mat4Multiply(projection, mat4Multiply(view, model));
      const detailClipRects = detailClipBounds ? computeClipRects(detailClipBounds) : [];
      const lodClipCount = detailClipRects.length > 0 ? Math.min(2, detailClipRects.length) : 0;

      gl.useProgram(program);
      gl.uniformMatrix4fv(mvpLoc, false, mvp);
      gl.uniformMatrix4fv(modelLoc, false, model);
      gl.uniform3f(lightLoc, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
      gl.uniform1f(lightMixLoc, 1);
      gl.uniform3f(colorLoc, 0.3, 0.7, 0.55);
      gl.uniform1i(textureLoc, 0);
      gl.uniform1f(skirtCutLoc, 0);

      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);

      const drawLodMesh = (lodMesh: LodMeshState) => {
        if (!lodMesh.meshReady) return;
        gl.uniform1i(clipCountLoc, lodClipCount);
        if (lodClipCount > 0) {
          const rect0 = detailClipRects[0]!;
          gl.uniform4f(clipRect0Loc, rect0[0], rect0[1], rect0[2], rect0[3]);
          if (lodClipCount > 1) {
            const rect1 = detailClipRects[1]!;
            gl.uniform4f(clipRect1Loc, rect1[0], rect1[1], rect1[2], rect1[3]);
          } else {
            gl.uniform4f(clipRect1Loc, 0, 0, 0, 0);
          }
        } else {
          gl.uniform4f(clipRect0Loc, 0, 0, 0, 0);
          gl.uniform4f(clipRect1Loc, 0, 0, 0, 0);
        }
        gl.uniform1f(textureMixLoc, lodMesh.textureReady ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, lodMesh.textureReady ? lodMesh.atlas?.texture ?? fallbackTexture : fallbackTexture);
        gl.bindVertexArray(lodMesh.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lodMesh.ibo);
        gl.drawElements(gl.TRIANGLES, lodMesh.indexCount, lodMesh.indexType, 0);
      };

      gl.uniform1f(skirtCutLoc, 0);
      for (const lodMesh of lodMeshOrder) {
        drawLodMesh(lodMesh);
      }

      gl.uniform1i(clipCountLoc, 0);
      gl.uniform1f(textureMixLoc, detailTextureReady ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, detailTextureReady ? detailAtlas?.texture ?? fallbackTexture : fallbackTexture);
      gl.uniform1f(skirtCutLoc, 1);

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fillIbo);
      gl.drawElements(gl.TRIANGLES, detailIndexCount, detailIndexType, 0);

      gl.disable(gl.POLYGON_OFFSET_FILL);

      gl.bindVertexArray(null);

      if (
        labelCtx &&
        labelCanvas &&
        areasState &&
        areasState.enabled &&
        currentView &&
        meshReference
      ) {
        const project = (x: number, y: number) => {
          const pos = projectTesseraToEnu(
            x,
            y,
            AREA_OVERLAY_HEIGHT_METERS,
            meshReference,
            meshScale,
            meshOffset
          );
          return projectToScreen(pos, mvp, canvas.width, canvas.height);
        };
        const areaDraw = new ProjectedCanvasDraw(labelCtx, project);
        renderEditableAreas(
          areaDraw as unknown as DrawContext,
          IDENTITY_MAT3,
          currentView.viewportWidth,
          currentView.viewportHeight,
          currentView.bounds,
          time / 1000,
          areasState,
          null
        );
      }

      const labelItems: LabelItem[] = [];
      let labelOffsetPx = 12;

      if (
        aircraftReady &&
        aircraftInstanceBuffer &&
        aircraftVao &&
        meshReference &&
        currentView &&
        aircraftList.length > 0
      ) {
        const sizes = computeAircraftSize(currentView, meshReference, meshScale, meshOffset, detailMeshRadius);
        const bounds = currentView.bounds;
        const worldSize = sizes.world;
        const enuSize = sizes.enu;
        const labelAnchor = projectToScreen(target, mvp, canvas.width, canvas.height);
        if (labelAnchor) {
          const labelOffsetAnchor = projectToScreen(
            [target[0] + enuSize, target[1], target[2]],
            mvp,
            canvas.width,
            canvas.height
          );
          if (labelOffsetAnchor) {
            labelOffsetPx = Math.max(
              8,
              Math.hypot(labelOffsetAnchor.x - labelAnchor.x, labelOffsetAnchor.y - labelAnchor.y) * 1.2
            );
          }
        }
        let count = 0;

        for (const ac of aircraftList) {
          if (ac.y + worldSize < bounds.top || ac.y - worldSize > bounds.bottom) {
            continue;
          }
          const renderX = getWrappedX(ac.x, worldSize, bounds.left, bounds.right);
          if (renderX === null) continue;

          const altitude = (ac.onGround ? 0 : ac.altitude) + AIRCRAFT_ALTITUDE_OFFSET;
          const pos = projectTesseraToEnu(renderX, ac.y, altitude, meshReference, meshScale, meshOffset);
          const color = getAltitudeColor(ac.altitude, ac.onGround);
          const screen = projectToScreen(pos, mvp, canvas.width, canvas.height);
          if (screen && currentView.zoom >= 4) {
            labelItems.push({
              id: ac.icao24,
              text: ac.callsign || ac.icao24,
              anchorX: screen.x,
              anchorY: screen.y,
              priority: ac.callsign ? 1 : 0,
            });
          }

          const base = count * AIRCRAFT_INSTANCE_STRIDE;
          aircraftInstanceData[base] = pos[0];
          aircraftInstanceData[base + 1] = pos[1];
          aircraftInstanceData[base + 2] = pos[2];
          aircraftInstanceData[base + 3] = ac.heading;
          aircraftInstanceData[base + 4] = enuSize;
          aircraftInstanceData[base + 5] = color[0];
          aircraftInstanceData[base + 6] = color[1];
          aircraftInstanceData[base + 7] = color[2];
          count++;
          if (count >= AIRCRAFT_MAX_INSTANCES) break;
        }

        if (count > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, aircraftInstanceBuffer);
          gl.bufferSubData(
            gl.ARRAY_BUFFER,
            0,
            aircraftInstanceData.subarray(0, count * AIRCRAFT_INSTANCE_STRIDE)
          );

          gl.useProgram(aircraftProgram);
          gl.uniformMatrix4fv(aircraftMvpLoc, false, mvp);
          gl.uniform3f(aircraftLightLoc, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
          gl.bindVertexArray(aircraftVao);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, AIRCRAFT_VERTEX_COUNT, count);
          gl.disable(gl.BLEND);
          gl.bindVertexArray(null);
        }
      }

      if (labelCtx && labelCanvas && labelItems.length > 0) {
        const placement = labelPlacer.place(
          labelItems,
          (x, y) => ({ screenX: x, screenY: y }),
          labelCanvas.width,
          labelCanvas.height,
          labelOffsetPx,
          { x: 0, y: 0 }
        );

        labelCtx.save();
        labelCtx.font = LABEL_FONT;
        labelCtx.textBaseline = "middle";
        labelCtx.textAlign = "left";
        labelCtx.lineWidth = 2;

        const drawText = (text: string, x: number, y: number) => {
          labelCtx.strokeStyle = "rgba(0, 0, 0, 0.8)";
          labelCtx.strokeText(text, x, y);
          labelCtx.fillStyle = "rgba(255, 255, 255, 1)";
          labelCtx.fillText(text, x, y);
        };

        for (const label of placement.directLabels) {
          drawText(label.item.text, label.screenX, label.screenY + LABEL_FONT_SIZE / 2);
        }

        labelCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        labelCtx.lineWidth = 1;
        for (const label of placement.leaderLabels) {
          labelCtx.beginPath();
          labelCtx.moveTo(label.anchorScreenX, label.anchorScreenY);
          labelCtx.lineTo(label.screenX, label.screenY + LABEL_FONT_SIZE / 2);
          labelCtx.stroke();
          drawText(label.item.text, label.screenX, label.screenY + LABEL_FONT_SIZE / 2);
        }

        for (const callout of placement.callouts) {
          const boxCenterX = callout.boxX + callout.boxWidth / 2;
          const boxCenterY = callout.boxY + callout.boxHeight / 2;
          labelCtx.strokeStyle = "rgba(255, 255, 255, 1)";
          labelCtx.lineWidth = 1;
          labelCtx.beginPath();
          labelCtx.moveTo(boxCenterX, boxCenterY);
          labelCtx.lineTo(callout.centroidX, callout.centroidY);
          labelCtx.stroke();

          labelCtx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          for (const acPoint of callout.aircraftPoints) {
            labelCtx.beginPath();
            labelCtx.moveTo(callout.centroidX, callout.centroidY);
            labelCtx.lineTo(acPoint.screenX, acPoint.screenY);
            labelCtx.stroke();
          }
        }

        for (const callout of placement.callouts) {
          labelCtx.fillStyle = "rgba(26, 26, 26, 1)";
          labelCtx.fillRect(callout.boxX, callout.boxY, callout.boxWidth, callout.boxHeight);
          labelCtx.strokeStyle = "rgba(255, 255, 255, 0.6)";
          labelCtx.lineWidth = 1;
          labelCtx.strokeRect(callout.boxX, callout.boxY, callout.boxWidth, callout.boxHeight);

          const lineHeight = LABEL_FONT_SIZE * 1.2;
          const padding = 4;
          for (let i = 0; i < callout.items.length; i++) {
            const textY = callout.boxY + padding + (i + 0.5) * lineHeight;
            drawText(callout.items[i]!.text, callout.boxX + padding, textY);
          }
          if (callout.hiddenCount > 0) {
            const textY = callout.boxY + padding + (callout.items.length + 0.5) * lineHeight;
            drawText(`+${callout.hiddenCount} more`, callout.boxX + padding, textY);
          }
        }

        if (placement.hiddenIndicator) {
          drawText(
            placement.hiddenIndicator.item.text,
            placement.hiddenIndicator.screenX,
            placement.hiddenIndicator.screenY + LABEL_FONT_SIZE / 2
          );
        }

        labelCtx.restore();
      }
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
      if (viewDebounceId !== null) {
        window.clearTimeout(viewDebounceId);
        viewDebounceId = null;
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(nbo);
      gl.deleteBuffer(uvbo);
      gl.deleteBuffer(skbo);
      gl.deleteBuffer(tbo);
      gl.deleteBuffer(fillIbo);
      if (vao) gl.deleteVertexArray(vao);
      for (const lodMesh of lodMeshes.values()) {
        deleteLodState(lodMesh);
      }
      if (aircraftVao) gl.deleteVertexArray(aircraftVao);
      gl.deleteBuffer(aircraftShapeBuffer);
      gl.deleteBuffer(aircraftNormalBuffer);
      gl.deleteBuffer(aircraftInstanceBuffer);
      if (detailAtlas?.texture) gl.deleteTexture(detailAtlas.texture);
      if (fallbackTexture) gl.deleteTexture(fallbackTexture);
      gl.deleteProgram(program);
      gl.deleteProgram(aircraftProgram);
    },
    resize,
    setView,
    setAircraft,
    setAreas,
  };
}
