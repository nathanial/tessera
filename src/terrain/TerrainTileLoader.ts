/**
 * Cesium Quantized-Mesh Terrain Tile Loader
 *
 * Parses the quantized-mesh format:
 * https://github.com/CesiumGS/quantized-mesh
 */

/** Terrain tile header (fixed 88 bytes) */
export interface TerrainTileHeader {
  centerX: number; // ECEF center X
  centerY: number; // ECEF center Y
  centerZ: number; // ECEF center Z
  minimumHeight: number; // Minimum height in meters
  maximumHeight: number; // Maximum height in meters
  boundingSphereCenterX: number;
  boundingSphereCenterY: number;
  boundingSphereCenterZ: number;
  boundingSphereRadius: number;
  horizonOcclusionPointX: number;
  horizonOcclusionPointY: number;
  horizonOcclusionPointZ: number;
}

/** Parsed terrain tile data */
export interface TerrainTileData {
  header: TerrainTileHeader;
  vertexCount: number;
  /** U coordinates (0-32767, quantized horizontal position) */
  u: Uint16Array;
  /** V coordinates (0-32767, quantized vertical position) */
  v: Uint16Array;
  /** Height values (0-32767, quantized between min/max height) */
  height: Uint16Array;
  /** Triangle indices */
  indices: Uint16Array | Uint32Array;
  /** Edge indices for stitching */
  westIndices: Uint16Array | Uint32Array;
  southIndices: Uint16Array | Uint32Array;
  eastIndices: Uint16Array | Uint32Array;
  northIndices: Uint16Array | Uint32Array;
}

/** Tile coordinate */
export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/** Height exaggeration factor (10x as per user preference) */
export const HEIGHT_EXAGGERATION = 10;

/** Earth circumference in meters */
export const EARTH_CIRCUMFERENCE = 40075017;

/** Height scale: meters to world units (0-1 coordinate space) */
export const HEIGHT_SCALE = 1 / EARTH_CIRCUMFERENCE;

/**
 * Decode delta-encoded and zigzag-encoded values.
 * Cesium uses zigzag encoding for efficient variable-length integers.
 */
function zigzagDecode(value: number): number {
  return (value >> 1) ^ -(value & 1);
}

/**
 * Decode delta-encoded array in place.
 * Values are stored as deltas from previous value.
 */
function decodeDelta(encoded: Uint16Array): void {
  let value = 0;
  for (let i = 0; i < encoded.length; i++) {
    value += zigzagDecode(encoded[i]!);
    encoded[i] = value;
  }
}

/**
 * Parse the quantized-mesh binary format.
 */
export function parseQuantizedMesh(buffer: ArrayBuffer): TerrainTileData {
  const view = new DataView(buffer);
  let offset = 0;

  // Read header (88 bytes, little-endian doubles)
  const header: TerrainTileHeader = {
    centerX: view.getFloat64(offset, true),
    centerY: view.getFloat64(offset + 8, true),
    centerZ: view.getFloat64(offset + 16, true),
    minimumHeight: view.getFloat32(offset + 24, true),
    maximumHeight: view.getFloat32(offset + 28, true),
    boundingSphereCenterX: view.getFloat64(offset + 32, true),
    boundingSphereCenterY: view.getFloat64(offset + 40, true),
    boundingSphereCenterZ: view.getFloat64(offset + 48, true),
    boundingSphereRadius: view.getFloat64(offset + 56, true),
    horizonOcclusionPointX: view.getFloat64(offset + 64, true),
    horizonOcclusionPointY: view.getFloat64(offset + 72, true),
    horizonOcclusionPointZ: view.getFloat64(offset + 80, true),
  };
  offset += 88;

  // Read vertex count
  const vertexCount = view.getUint32(offset, true);
  offset += 4;

  // Read U values (delta + zigzag encoded)
  const u = new Uint16Array(buffer, offset, vertexCount);
  offset += vertexCount * 2;
  decodeDelta(u);

  // Read V values
  const v = new Uint16Array(buffer, offset, vertexCount);
  offset += vertexCount * 2;
  decodeDelta(v);

  // Read height values
  const height = new Uint16Array(buffer, offset, vertexCount);
  offset += vertexCount * 2;
  decodeDelta(height);

  // Align to 4-byte boundary for index data if using 32-bit indices
  if (vertexCount > 65536) {
    offset = Math.ceil(offset / 4) * 4;
  }

  // Read triangle count
  const triangleCount = view.getUint32(offset, true);
  offset += 4;

  // Read indices (16-bit or 32-bit based on vertex count)
  let indices: Uint16Array | Uint32Array;
  const indexCount = triangleCount * 3;

  if (vertexCount > 65536) {
    indices = new Uint32Array(buffer, offset, indexCount);
    offset += indexCount * 4;
  } else {
    indices = new Uint16Array(buffer, offset, indexCount);
    offset += indexCount * 2;
  }

  // Decode high-water-mark encoded indices
  let highest = 0;
  for (let i = 0; i < indices.length; i++) {
    const code = indices[i]!;
    if (code === 0) {
      indices[i] = highest++;
    } else {
      indices[i] = highest - code;
    }
  }

  // Read edge vertex indices for neighbor tile stitching
  const westVertexCount = view.getUint32(offset, true);
  offset += 4;
  let westIndices: Uint16Array | Uint32Array;
  if (vertexCount > 65536) {
    westIndices = new Uint32Array(buffer, offset, westVertexCount);
    offset += westVertexCount * 4;
  } else {
    westIndices = new Uint16Array(buffer, offset, westVertexCount);
    offset += westVertexCount * 2;
  }

  const southVertexCount = view.getUint32(offset, true);
  offset += 4;
  let southIndices: Uint16Array | Uint32Array;
  if (vertexCount > 65536) {
    southIndices = new Uint32Array(buffer, offset, southVertexCount);
    offset += southVertexCount * 4;
  } else {
    southIndices = new Uint16Array(buffer, offset, southVertexCount);
    offset += southVertexCount * 2;
  }

  const eastVertexCount = view.getUint32(offset, true);
  offset += 4;
  let eastIndices: Uint16Array | Uint32Array;
  if (vertexCount > 65536) {
    eastIndices = new Uint32Array(buffer, offset, eastVertexCount);
    offset += eastVertexCount * 4;
  } else {
    eastIndices = new Uint16Array(buffer, offset, eastVertexCount);
    offset += eastVertexCount * 2;
  }

  const northVertexCount = view.getUint32(offset, true);
  offset += 4;
  let northIndices: Uint16Array | Uint32Array;
  if (vertexCount > 65536) {
    northIndices = new Uint32Array(buffer, offset, northVertexCount);
    // offset += northVertexCount * 4;
  } else {
    northIndices = new Uint16Array(buffer, offset, northVertexCount);
    // offset += northVertexCount * 2;
  }

  return {
    header,
    vertexCount,
    u,
    v,
    height,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  };
}

/**
 * Convert tile coordinates to Web Mercator bounds (0-1 range).
 */
export function tileToMercatorBounds(coord: TileCoord): {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  const scale = Math.pow(2, coord.z);
  const west = coord.x / scale;
  const east = (coord.x + 1) / scale;
  // TMS Y coordinate (flipped from XYZ)
  const north = 1 - coord.y / scale;
  const south = 1 - (coord.y + 1) / scale;

  return { west, south, east, north };
}

/**
 * Convert quantized height (0-32767) to world units with exaggeration.
 */
export function quantizedHeightToWorld(
  quantized: number,
  minHeight: number,
  maxHeight: number
): number {
  // Lerp between min and max height
  const heightMeters = minHeight + (quantized / 32767) * (maxHeight - minHeight);
  // Convert to world units and apply exaggeration
  return heightMeters * HEIGHT_SCALE * HEIGHT_EXAGGERATION;
}
