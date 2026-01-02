/**
 * GeoJSON drawing helpers.
 * Provides methods to trace GeoJSON geometries onto a path.
 */

export interface PathApi {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

/**
 * Trace a line onto a path.
 */
export function traceLine(path: PathApi, coords: number[][]): void {
  if (coords.length === 0) return;
  const [x, y] = coords[0]!;
  path.moveTo(x!, y!);
  for (let i = 1; i < coords.length; i++) {
    const [px, py] = coords[i]!;
    path.lineTo(px!, py!);
  }
}

/**
 * Trace a polygon (with holes) onto a path.
 */
export function tracePolygon(path: PathApi, rings: number[][][]): void {
  for (const ring of rings) {
    traceLine(path, ring);
    path.closePath();
  }
}

/**
 * Fill a GeoJSON Polygon or MultiPolygon.
 */
export function fillGeoJSON(
  path: PathApi,
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
): void {
  path.beginPath();

  if (geometry.type === "Polygon") {
    tracePolygon(path, geometry.coordinates);
  } else {
    for (const polygon of geometry.coordinates) {
      tracePolygon(path, polygon);
    }
  }

  path.fill();
}

/**
 * Stroke a GeoJSON LineString, MultiLineString, Polygon, or MultiPolygon.
 */
export function strokeGeoJSON(
  path: PathApi,
  geometry:
    | { type: "LineString"; coordinates: number[][] }
    | { type: "MultiLineString"; coordinates: number[][][] }
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
): void {
  path.beginPath();

  if (geometry.type === "LineString") {
    traceLine(path, geometry.coordinates);
  } else if (geometry.type === "MultiLineString") {
    for (const line of geometry.coordinates) {
      traceLine(path, line);
    }
  } else if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      traceLine(path, ring);
      path.closePath();
    }
  } else {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        traceLine(path, ring);
        path.closePath();
      }
    }
  }

  path.stroke();
}
