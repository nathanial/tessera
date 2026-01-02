/**
 * Editable area definitions + rendering + interaction.
 */

import type { DrawContext } from "../src/index";
import { lonLatToTessera, type Tessera } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import { screenToWorld, worldToScreen } from "./CoordinateUtils";
import type { SDFCircleRenderer } from "./SDFCircleRenderer";
import {
  angleBetween,
  computeGateCorners,
  computeGridBoundary,
  findNearestPoint,
  lerp,
  normalizeArc,
  offsetPolygon,
  pointInPolygon,
  polygonBounds,
  TAU_CONST,
  type Color,
  type Vec2,
} from "./EditableAreasUtils";

const HANDLE_RADIUS_PX = 6;
const HANDLE_FILL: Color = [1, 1, 1, 0.9];
const HANDLE_STROKE: Color = [0.05, 0.05, 0.05, 0.8];
const HANDLE_ACTIVE: Color = [0.15, 0.8, 1, 0.9];

const MIN_GATE_LENGTH = 0.02;
const MIN_GATE_WIDTH = 0.01;
const MIN_RING_RADIUS = 0.015;
const MIN_RING_SPAN = Math.PI / 12;

const DEFAULT_DASH = 0.02;
const DEFAULT_GAP = 0.015;

export type AreaType =
  | "ink"
  | "contours"
  | "magnetic"
  | "grid"
  | "stamp"
  | "heat"
  | "gate"
  | "ring";

interface AreaBase {
  id: string;
  type: AreaType;
  label: string;
  color: Color;
  accent: Color;
  version: number;
}

export interface InkArea extends AreaBase {
  type: "ink";
  points: Vec2[];
  softness: number;
}

export interface ContourArea extends AreaBase {
  type: "contours";
  points: Vec2[];
  bandCount: number;
  bandSpacing: number;
}

export interface MagneticArea extends AreaBase {
  type: "magnetic";
  points: Vec2[];
  snapRadius: number;
}

export interface GridArea extends AreaBase {
  type: "grid";
  grid: Vec2[][];
  rows: number;
  cols: number;
}

export interface StampArea extends AreaBase {
  type: "stamp";
  points: Vec2[];
  stampSpacing: number;
  stampSize: number;
}

export interface HeatArea extends AreaBase {
  type: "heat";
  points: Vec2[];
  flowAngle: number;
  flowSpeed: number;
}

export interface GateArea extends AreaBase {
  type: "gate";
  center: Vec2;
  length: number;
  width: number;
  rotation: number;
}

export interface RingArea extends AreaBase {
  type: "ring";
  center: Vec2;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
}

export type EditableArea =
  | InkArea
  | ContourArea
  | MagneticArea
  | GridArea
  | StampArea
  | HeatArea
  | GateArea
  | RingArea;

export interface EditableAreasState {
  areas: EditableArea[];
  selectedId: string | null;
  activeHandle: AreaHandle | null;
  dragState: DragState | null;
  enabled: boolean;
  cache: Map<string, AreaCache>;
}

interface DragState {
  areaId: string;
  mode: "move" | "handle";
  handle?: AreaHandle;
  lastWorld: Vec2;
}

interface AreaHandle {
  areaId: string;
  kind:
    | "vertex"
    | "grid"
    | "gate-length"
    | "gate-width"
    | "gate-rotate"
    | "ring-radius"
    | "ring-angle-start"
    | "ring-angle-end";
  index?: number;
  row?: number;
  col?: number;
  sign?: number;
}

interface HandlePosition {
  handle: AreaHandle;
  position: Vec2;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface HeatFlowSegment {
  baseX: number;
  baseY: number;
  dist: number;
}

interface HeatFlowCache {
  dir: Vec2;
  segmentLength: number;
  step: number;
  half: number;
  segments: HeatFlowSegment[];
}

interface AreaCache {
  version: number;
  detailReady: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  inkLayers?: Vec2[][];
  contourBands?: Vec2[][];
  dotPoints?: Vec2[];
  stampPoints?: Vec2[];
  gridBoundary?: Vec2[];
  gateCorners?: Vec2[];
  ringArc?: Vec2[];
  heatFlow?: HeatFlowCache;
}

const makeId = (() => {
  let counter = 0;
  return (prefix: string) => `${prefix}-${counter++}`;
})();

function lonLat(lon: number, lat: number): Vec2 {
  const world = lonLatToTessera(lon, lat);
  return { x: world.x, y: world.y };
}

function polygonFromLonLat(points: Array<[number, number]>): Vec2[] {
  return points.map(([lon, lat]) => lonLat(lon, lat));
}

function createGridFromCorners(
  topLeft: Vec2,
  topRight: Vec2,
  bottomLeft: Vec2,
  bottomRight: Vec2,
  rows: number,
  cols: number
): Vec2[][] {
  const grid: Vec2[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Vec2[] = [];
    const v = rows === 1 ? 0 : r / (rows - 1);
    const left = {
      x: lerp(topLeft.x, bottomLeft.x, v),
      y: lerp(topLeft.y, bottomLeft.y, v),
    };
    const right = {
      x: lerp(topRight.x, bottomRight.x, v),
      y: lerp(topRight.y, bottomRight.y, v),
    };
    for (let c = 0; c < cols; c++) {
      const u = cols === 1 ? 0 : c / (cols - 1);
      row.push({
        x: lerp(left.x, right.x, u),
        y: lerp(left.y, right.y, u),
      });
    }
    grid.push(row);
  }
  return grid;
}

function computeWorldPerPixel(bounds: Bounds, viewportWidth: number): number {
  return (bounds.right - bounds.left) / Math.max(1, viewportWidth);
}

function markAreaDirty(area: EditableArea): void {
  area.version += 1;
}

function isBoundsVisible(
  areaBounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewBounds: Bounds,
  padding: number
): boolean {
  const left = Math.min(viewBounds.left, viewBounds.right);
  const right = Math.max(viewBounds.left, viewBounds.right);
  const top = Math.min(viewBounds.top, viewBounds.bottom);
  const bottom = Math.max(viewBounds.top, viewBounds.bottom);
  return !(
    areaBounds.maxX < left - padding ||
    areaBounds.minX > right + padding ||
    areaBounds.maxY < top - padding ||
    areaBounds.minY > bottom + padding
  );
}

function buildMagneticDots(points: Vec2[], spacing: number): Vec2[] {
  if (spacing <= 0 || points.length < 3) return [];
  const bounds = polygonBounds(points);
  const dots: Vec2[] = [];
  const startX = bounds.minX - spacing;
  const endX = bounds.maxX + spacing;
  const startY = bounds.minY - spacing;
  const endY = bounds.maxY + spacing;
  for (let y = startY; y <= endY; y += spacing) {
    for (let x = startX; x <= endX; x += spacing) {
      if (pointInPolygon({ x, y }, points)) {
        dots.push({ x, y });
      }
    }
  }
  return dots;
}

function buildStampPoints(points: Vec2[], spacing: number): Vec2[] {
  if (spacing <= 0 || points.length < 2) return [];
  const stamps: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    const steps = Math.max(2, Math.floor(segLen / spacing));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamps.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return stamps;
}

function buildHeatFlowCache(points: Vec2[], angle: number): HeatFlowCache | null {
  if (points.length < 3) return null;
  const bounds = polygonBounds(points);
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  if (!Number.isFinite(span) || span <= 0) return null;

  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };
  const spacing = Math.max(span / 12, span * 0.02);
  const segmentLength = spacing * 0.5;
  const step = spacing * 0.8;
  const half = span * 0.6;
  const center = { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5 };

  const count = Math.max(4, Math.floor(span / spacing));
  const segments: HeatFlowSegment[] = [];
  for (let i = -count; i <= count; i++) {
    const offset = i * spacing;
    const baseX = center.x + perp.x * offset;
    const baseY = center.y + perp.y * offset;
    for (let dist = -half; dist < half; dist += step) {
      const midX = baseX + dir.x * (dist + segmentLength * 0.5);
      const midY = baseY + dir.y * (dist + segmentLength * 0.5);
      if (pointInPolygon({ x: midX, y: midY }, points)) {
        segments.push({ baseX, baseY, dist });
      }
    }
  }

  return {
    dir,
    segmentLength,
    step,
    half,
    segments,
  };
}

function computeAreaBounds(area: EditableArea): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (area.type) {
    case "grid": {
      return polygonBounds(computeGridBoundary(area.grid));
    }
    case "gate": {
      return polygonBounds(computeGateCorners(area.center, area.length, area.width, area.rotation));
    }
    case "ring": {
      return {
        minX: area.center.x - area.outerRadius,
        minY: area.center.y - area.outerRadius,
        maxX: area.center.x + area.outerRadius,
        maxY: area.center.y + area.outerRadius,
      };
    }
    default: {
      return polygonBounds(area.points);
    }
  }
}

function buildAreaCache(area: EditableArea): AreaCache {
  const cache: AreaCache = {
    version: area.version,
    detailReady: true,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };

  switch (area.type) {
    case "ink": {
      cache.bounds = polygonBounds(area.points);
      const layers: Vec2[][] = [];
      const layerCount = 3;
      for (let i = 0; i < layerCount; i++) {
        const inset = -area.softness * (i / (layerCount + 1));
        layers.push(Math.abs(inset) < 1e-8 ? area.points : offsetPolygon(area.points, inset));
      }
      cache.inkLayers = layers;
      return cache;
    }
    case "contours": {
      cache.bounds = polygonBounds(area.points);
      const bands: Vec2[][] = [];
      for (let i = 1; i <= area.bandCount; i++) {
        const band = offsetPolygon(area.points, area.bandSpacing * i);
        bands.push(band);
        const bandBounds = polygonBounds(band);
        cache.bounds = {
          minX: Math.min(cache.bounds.minX, bandBounds.minX),
          minY: Math.min(cache.bounds.minY, bandBounds.minY),
          maxX: Math.max(cache.bounds.maxX, bandBounds.maxX),
          maxY: Math.max(cache.bounds.maxY, bandBounds.maxY),
        };
      }
      cache.contourBands = bands;
      return cache;
    }
    case "magnetic": {
      cache.bounds = polygonBounds(area.points);
      cache.dotPoints = buildMagneticDots(area.points, area.snapRadius * 0.7);
      return cache;
    }
    case "grid": {
      cache.gridBoundary = computeGridBoundary(area.grid);
      cache.bounds = polygonBounds(cache.gridBoundary);
      return cache;
    }
    case "stamp": {
      cache.bounds = polygonBounds(area.points);
      cache.stampPoints = buildStampPoints(area.points, area.stampSpacing);
      return cache;
    }
    case "heat": {
      cache.bounds = polygonBounds(area.points);
      const flow = buildHeatFlowCache(area.points, area.flowAngle);
      if (flow) {
        cache.heatFlow = flow;
      }
      return cache;
    }
    case "gate": {
      cache.gateCorners = computeGateCorners(area.center, area.length, area.width, area.rotation);
      cache.bounds = polygonBounds(cache.gateCorners);
      return cache;
    }
    case "ring": {
      cache.bounds = {
        minX: area.center.x - area.outerRadius,
        minY: area.center.y - area.outerRadius,
        maxX: area.center.x + area.outerRadius,
        maxY: area.center.y + area.outerRadius,
      };
      const arc = normalizeArc(area.startAngle, area.endAngle);
      cache.ringArc = buildArcPoints(area.center, area.outerRadius, arc.start, arc.end, 32);
      return cache;
    }
  }
}

function getAreaBounds(area: EditableArea, state: EditableAreasState): { minX: number; minY: number; maxX: number; maxY: number } {
  const cached = state.cache.get(area.id);
  if (cached && cached.version === area.version) {
    return cached.bounds;
  }
  const bounds = computeAreaBounds(area);
  state.cache.set(area.id, { version: area.version, detailReady: false, bounds });
  return bounds;
}

function getAreaCache(area: EditableArea, state: EditableAreasState): AreaCache {
  const cached = state.cache.get(area.id);
  if (cached && cached.version === area.version && cached.detailReady) return cached;
  const next = buildAreaCache(area);
  state.cache.set(area.id, next);
  return next;
}

function drawPolygon(draw: DrawContext, points: Vec2[], fill: boolean, stroke: boolean): void {
  if (points.length < 2) return;
  draw.beginPath();
  draw.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    draw.lineTo(p.x, p.y);
  }
  draw.closePath();
  if (fill) draw.fill();
  if (stroke) draw.stroke();
}

function drawPolyline(draw: DrawContext, points: Vec2[], closed = false): void {
  if (points.length < 2) return;
  draw.beginPath();
  draw.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    draw.lineTo(points[i]!.x, points[i]!.y);
  }
  if (closed) {
    draw.closePath();
  }
  draw.stroke();
}

function drawDashedPolyline(
  draw: DrawContext,
  points: Vec2[],
  dash: number,
  gap: number,
  closed = false,
  dashOffset = 0
): void {
  if (points.length < 2) return;
  const pattern = dash + gap;
  let offset = ((dashOffset % pattern) + pattern) % pattern;
  const lastIndex = points.length - 1;
  const segmentCount = closed ? points.length : lastIndex;

  draw.beginPath();

  for (let i = 0; i < segmentCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;

    let dist = 0;
    while (dist < segLen) {
      const segmentOffset = offset % pattern;
      const dashRemaining = dash - segmentOffset;
      const drawLen = Math.max(0, Math.min(dashRemaining, segLen - dist));
      if (drawLen > 0) {
        const t0 = dist / segLen;
        const t1 = (dist + drawLen) / segLen;
        draw.moveTo(a.x + dx * t0, a.y + dy * t0);
        draw.lineTo(a.x + dx * t1, a.y + dy * t1);
      }
      dist += drawLen + gap;
      offset = (segmentOffset + drawLen + gap) % pattern;
    }
  }

  draw.stroke();
}

function renderDotLatticeCircles(
  circleRenderer: SDFCircleRenderer | null,
  points: Vec2[],
  radiusWorld: number,
  worldPerPixel: number,
  timeSeconds: number,
  color: Color
): void {
  if (!circleRenderer || points.length === 0 || worldPerPixel <= 0) return;
  const baseRadiusPx = radiusWorld / worldPerPixel;
  const feather = Math.max(1.0, baseRadiusPx * 0.25);

  for (const p of points) {
    const shimmer = 0.5 + 0.5 * Math.sin(timeSeconds * 2.2 + p.x * 60 + p.y * 45);
    const rPx = baseRadiusPx * (0.8 + shimmer * 0.2);
    circleRenderer.addCircle(p.x, p.y, rPx, feather, color);
  }
}

function renderStampCircles(
  circleRenderer: SDFCircleRenderer | null,
  points: Vec2[],
  sizeWorld: number,
  worldPerPixel: number,
  timeSeconds: number,
  color: Color
): void {
  if (!circleRenderer || points.length === 0 || worldPerPixel <= 0) return;
  const baseRadiusPx = sizeWorld / worldPerPixel;
  const feather = Math.max(1.0, baseRadiusPx * 0.3);

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const jitter = 0.2 * Math.sin(timeSeconds * 1.5 + i * 2.1);
    const rPx = baseRadiusPx * (0.6 + jitter);
    circleRenderer.addCircle(p.x, p.y, rPx, feather, color);
  }
}

function renderFlowLines(
  draw: DrawContext,
  polygon: Vec2[],
  angle: number,
  speed: number,
  timeSeconds: number,
  color: Color
): void {
  const bounds = polygonBounds(polygon);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };

  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const spacing = span / 12;
  const segmentLength = spacing * 0.5;
  const step = spacing * 0.8;
  const phase = (timeSeconds * speed) % step;

  const center = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5,
  };

  draw.strokeStyle = color;
  draw.lineWidth = 1.2;
  draw.beginPath();

  const count = Math.max(4, Math.floor(span / spacing));
  for (let i = -count; i <= count; i++) {
    const offset = (i * spacing);
    const base = {
      x: center.x + perp.x * offset,
      y: center.y + perp.y * offset,
    };
    const half = span * 0.6;
    let dist = -half + phase;
    while (dist < half) {
      const start = {
        x: base.x + dir.x * dist,
        y: base.y + dir.y * dist,
      };
      const end = {
        x: base.x + dir.x * (dist + segmentLength),
        y: base.y + dir.y * (dist + segmentLength),
      };
      const mid = {
        x: (start.x + end.x) * 0.5,
        y: (start.y + end.y) * 0.5,
      };
      if (pointInPolygon(mid, polygon)) {
        draw.moveTo(start.x, start.y);
        draw.lineTo(end.x, end.y);
      }
      dist += step;
    }
  }

  draw.stroke();
}

function renderCachedFlowLines(
  draw: DrawContext,
  flow: HeatFlowCache,
  timeSeconds: number,
  speed: number,
  color: Color
): void {
  if (flow.segments.length === 0 || flow.step <= 0 || flow.half <= 0) return;
  const phase = (timeSeconds * speed) % flow.step;

  draw.strokeStyle = color;
  draw.lineWidth = 1.2;
  draw.beginPath();

  for (const segment of flow.segments) {
    let offset = segment.dist + phase;
    if (offset > flow.half) {
      offset -= flow.half * 2;
    } else if (offset < -flow.half) {
      offset += flow.half * 2;
    }
    const startX = segment.baseX + flow.dir.x * offset;
    const startY = segment.baseY + flow.dir.y * offset;
    const endX = startX + flow.dir.x * flow.segmentLength;
    const endY = startY + flow.dir.y * flow.segmentLength;
    draw.moveTo(startX, startY);
    draw.lineTo(endX, endY);
  }

  draw.stroke();
}

function renderChevrons(
  draw: DrawContext,
  center: Vec2,
  length: number,
  width: number,
  rotation: number,
  color: Color
): void {
  const dir = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const perp = { x: -dir.y, y: dir.x };
  const halfLength = length * 0.5;
  const halfWidth = width * 0.5;

  const chevronCount = 3;
  const spacing = length / (chevronCount + 1);
  const size = Math.min(halfWidth * 0.6, spacing * 0.35);

  draw.strokeStyle = color;
  draw.lineWidth = 1.5;
  draw.beginPath();

  for (let i = 1; i <= chevronCount; i++) {
    const along = -halfLength + i * spacing;
    const base = {
      x: center.x + dir.x * along,
      y: center.y + dir.y * along,
    };

    const left = {
      x: base.x - dir.x * size + perp.x * size,
      y: base.y - dir.y * size + perp.y * size,
    };
    const right = {
      x: base.x - dir.x * size - perp.x * size,
      y: base.y - dir.y * size - perp.y * size,
    };
    const tip = {
      x: base.x + dir.x * size,
      y: base.y + dir.y * size,
    };
    draw.moveTo(left.x, left.y);
    draw.lineTo(tip.x, tip.y);
    draw.lineTo(right.x, right.y);
  }

  draw.stroke();
}

function renderRingMarkers(
  draw: DrawContext,
  area: RingArea,
  color: Color
): void {
  const { start, end } = normalizeArc(area.startAngle, area.endAngle);
  const span = end - start;
  const markerCount = Math.max(6, Math.floor(span / (Math.PI / 10)));
  const step = span / markerCount;

  draw.strokeStyle = color;
  draw.lineWidth = 1.2;
  draw.beginPath();

  for (let i = 0; i <= markerCount; i++) {
    const angle = start + step * i;
    const outer = {
      x: area.center.x + Math.cos(angle) * area.outerRadius,
      y: area.center.y + Math.sin(angle) * area.outerRadius,
    };
    const inner = {
      x: area.center.x + Math.cos(angle) * area.innerRadius,
      y: area.center.y + Math.sin(angle) * area.innerRadius,
    };
    draw.moveTo(inner.x, inner.y);
    draw.lineTo(outer.x, outer.y);
  }

  draw.stroke();
}

function renderInkArea(draw: DrawContext, area: InkArea, cache: AreaCache): void {
  const layers = cache.inkLayers ?? [area.points];
  for (let i = 0; i < layers.length; i++) {
    const poly = layers[i]!;
    if (poly.length < 3) continue;
    const alpha = 0.08 + i * 0.08;
    draw.fillStyle = [area.color[0], area.color[1], area.color[2], alpha];
    drawPolygon(draw, poly, true, false);
  }
  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.9];
  draw.lineWidth = 2;
  drawPolygon(draw, area.points, false, true);
}

function renderContourArea(draw: DrawContext, area: ContourArea, cache: AreaCache): void {
  const bands = cache.contourBands ?? [];
  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.8];
  draw.lineWidth = 1.6;
  for (const band of bands) {
    drawPolyline(draw, band, true);
  }
}

function renderMagneticArea(
  draw: DrawContext,
  area: MagneticArea,
  cache: AreaCache,
  timeSeconds: number,
  worldPerPixel: number,
  circleRenderer: SDFCircleRenderer | null
): void {
  draw.fillStyle = [area.color[0], area.color[1], area.color[2], 0.15];
  drawPolygon(draw, area.points, true, false);

  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.7];
  draw.lineWidth = 2;
  drawDashedPolyline(draw, area.points, DEFAULT_DASH, DEFAULT_GAP, true, timeSeconds * 0.02);

  renderDotLatticeCircles(
    circleRenderer,
    cache.dotPoints ?? [],
    area.snapRadius * 0.05,
    worldPerPixel,
    timeSeconds,
    [area.accent[0], area.accent[1], area.accent[2], 0.22]
  );
}

function renderGridArea(draw: DrawContext, area: GridArea, cache: AreaCache): void {
  const boundary = cache.gridBoundary ?? computeGridBoundary(area.grid);
  draw.fillStyle = [area.color[0], area.color[1], area.color[2], 0.12];
  drawPolygon(draw, boundary, true, false);

  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.7];
  draw.lineWidth = 1.2;
  drawPolyline(draw, boundary, true);

  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.4];
  draw.lineWidth = 1;
  for (const row of area.grid) {
    drawPolyline(draw, row, false);
  }
  const cols = area.grid[0]?.length ?? 0;
  for (let c = 0; c < cols; c++) {
    const column: Vec2[] = [];
    for (let r = 0; r < area.grid.length; r++) {
      const p = area.grid[r]?.[c];
      if (p) column.push(p);
    }
    drawPolyline(draw, column, false);
  }
}

function renderStampArea(
  draw: DrawContext,
  area: StampArea,
  cache: AreaCache,
  timeSeconds: number,
  worldPerPixel: number,
  circleRenderer: SDFCircleRenderer | null
): void {
  draw.fillStyle = [area.color[0], area.color[1], area.color[2], 0.1];
  drawPolygon(draw, area.points, true, false);
  renderStampCircles(
    circleRenderer,
    cache.stampPoints ?? [],
    area.stampSize * 0.6,
    worldPerPixel,
    timeSeconds,
    [area.accent[0], area.accent[1], area.accent[2], 0.35]
  );
}

function renderHeatArea(draw: DrawContext, area: HeatArea, cache: AreaCache, timeSeconds: number): void {
  draw.fillStyle = [area.color[0], area.color[1], area.color[2], 0.18];
  drawPolygon(draw, area.points, true, false);
  if (cache.heatFlow) {
    renderCachedFlowLines(
      draw,
      cache.heatFlow,
      timeSeconds,
      area.flowSpeed,
      [area.accent[0], area.accent[1], area.accent[2], 0.5]
    );
  } else {
    renderFlowLines(
      draw,
      area.points,
      area.flowAngle,
      area.flowSpeed,
      timeSeconds,
      [area.accent[0], area.accent[1], area.accent[2], 0.5]
    );
  }
  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.7];
  draw.lineWidth = 1.6;
  drawPolygon(draw, area.points, false, true);
}

function renderGateArea(draw: DrawContext, area: GateArea, cache: AreaCache): void {
  const corners = cache.gateCorners ?? computeGateCorners(area.center, area.length, area.width, area.rotation);
  draw.fillStyle = [area.color[0], area.color[1], area.color[2], 0.18];
  drawPolygon(draw, corners, true, false);
  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.75];
  draw.lineWidth = 2;
  drawPolygon(draw, corners, false, true);

  renderChevrons(draw, area.center, area.length, area.width, area.rotation, area.accent);
}

function renderRingArea(draw: DrawContext, area: RingArea, cache: AreaCache, timeSeconds: number): void {
  const { start, end } = normalizeArc(area.startAngle, area.endAngle);
  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.8];
  draw.lineWidth = 2;
  draw.beginPath();
  draw.arc(area.center.x, area.center.y, area.outerRadius, start, end);
  draw.stroke();

  draw.strokeStyle = [area.accent[0], area.accent[1], area.accent[2], 0.5];
  draw.lineWidth = 1.4;
  drawDashedPolyline(
    draw,
    cache.ringArc ?? buildArcPoints(area.center, area.outerRadius, start, end, 32),
    DEFAULT_DASH,
    DEFAULT_GAP,
    false,
    timeSeconds * 0.02
  );

  renderRingMarkers(draw, area, [area.accent[0], area.accent[1], area.accent[2], 0.45]);
}

function buildArcPoints(center: Vec2, radius: number, start: number, end: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  const span = end - start;
  const steps = Math.max(3, segments);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + span * t;
    pts.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return pts;
}

function getAreaPoints(area: EditableArea): Vec2[] | null {
  if ("points" in area) return area.points;
  if (area.type === "grid") return computeGridBoundary(area.grid);
  if (area.type === "gate") return computeGateCorners(area.center, area.length, area.width, area.rotation);
  if (area.type === "ring") {
    const { start, end } = normalizeArc(area.startAngle, area.endAngle);
    return buildArcPoints(area.center, area.outerRadius, start, end, 24);
  }
  return null;
}

function hitTestArea(area: EditableArea, world: Vec2): boolean {
  switch (area.type) {
    case "gate": {
      const corners = computeGateCorners(area.center, area.length, area.width, area.rotation);
      return pointInPolygon(world, corners);
    }
    case "grid": {
      const boundary = computeGridBoundary(area.grid);
      return pointInPolygon(world, boundary);
    }
    case "ring": {
      const dx = world.x - area.center.x;
      const dy = world.y - area.center.y;
      const dist = Math.hypot(dx, dy);
      if (dist < area.innerRadius || dist > area.outerRadius) return false;
      const angle = Math.atan2(dy, dx);
      return angleBetween(angle, area.startAngle, area.endAngle);
    }
    default: {
      const points = getAreaPoints(area);
      return points ? pointInPolygon(world, points) : false;
    }
  }
}

function getHandles(area: EditableArea): HandlePosition[] {
  const handles: HandlePosition[] = [];
  switch (area.type) {
    case "ink":
    case "contours":
    case "magnetic":
    case "stamp":
    case "heat": {
      area.points.forEach((p, index) => {
        handles.push({
          handle: { areaId: area.id, kind: "vertex", index },
          position: p,
        });
      });
      break;
    }
    case "grid": {
      for (let r = 0; r < area.grid.length; r++) {
        for (let c = 0; c < area.grid[r]!.length; c++) {
          handles.push({
            handle: { areaId: area.id, kind: "grid", row: r, col: c },
            position: area.grid[r]![c]!,
          });
        }
      }
      break;
    }
    case "gate": {
      const cos = Math.cos(area.rotation);
      const sin = Math.sin(area.rotation);
      const dir = { x: cos, y: sin };
      const perp = { x: -sin, y: cos };
      const halfLength = area.length * 0.5;
      const halfWidth = area.width * 0.5;
      handles.push({
        handle: { areaId: area.id, kind: "gate-length", sign: 1 },
        position: { x: area.center.x + dir.x * halfLength, y: area.center.y + dir.y * halfLength },
      });
      handles.push({
        handle: { areaId: area.id, kind: "gate-length", sign: -1 },
        position: { x: area.center.x - dir.x * halfLength, y: area.center.y - dir.y * halfLength },
      });
      handles.push({
        handle: { areaId: area.id, kind: "gate-width", sign: 1 },
        position: { x: area.center.x + perp.x * halfWidth, y: area.center.y + perp.y * halfWidth },
      });
      handles.push({
        handle: { areaId: area.id, kind: "gate-width", sign: -1 },
        position: { x: area.center.x - perp.x * halfWidth, y: area.center.y - perp.y * halfWidth },
      });
      handles.push({
        handle: { areaId: area.id, kind: "gate-rotate" },
        position: {
          x: area.center.x + dir.x * (halfLength + area.width * 0.4 + 0.01),
          y: area.center.y + dir.y * (halfLength + area.width * 0.4 + 0.01),
        },
      });
      break;
    }
    case "ring": {
      const { start, end } = normalizeArc(area.startAngle, area.endAngle);
      const mid = start + (end - start) * 0.5;
      handles.push({
        handle: { areaId: area.id, kind: "ring-radius" },
        position: {
          x: area.center.x + Math.cos(mid) * area.outerRadius,
          y: area.center.y + Math.sin(mid) * area.outerRadius,
        },
      });
      handles.push({
        handle: { areaId: area.id, kind: "ring-angle-start" },
        position: {
          x: area.center.x + Math.cos(start) * area.outerRadius,
          y: area.center.y + Math.sin(start) * area.outerRadius,
        },
      });
      handles.push({
        handle: { areaId: area.id, kind: "ring-angle-end" },
        position: {
          x: area.center.x + Math.cos(end) * area.outerRadius,
          y: area.center.y + Math.sin(end) * area.outerRadius,
        },
      });
      break;
    }
  }
  return handles;
}

function findHandleAtScreen(
  areas: EditableArea[],
  screenX: number,
  screenY: number,
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number
): HandlePosition | null {
  let best: HandlePosition | null = null;
  let bestDist = HANDLE_RADIUS_PX * HANDLE_RADIUS_PX;
  for (const area of areas) {
    const handles = getHandles(area);
    for (const handle of handles) {
      const screen = worldToScreen(handle.position.x, handle.position.y, matrix, viewportWidth, viewportHeight);
      const dx = screen.screenX - screenX;
      const dy = screen.screenY - screenY;
      const d = dx * dx + dy * dy;
      if (d <= bestDist) {
        bestDist = d;
        best = handle;
      }
    }
  }
  return best;
}

function applyHandleDrag(
  area: EditableArea,
  handle: AreaHandle,
  world: Vec2,
  aircraftPoints: Vec2[]
): void {
  switch (area.type) {
    case "ink":
    case "contours":
    case "stamp":
    case "heat":
    case "magnetic": {
      if (handle.kind !== "vertex" || handle.index === undefined) return;
      let target = world;
      if (area.type === "magnetic") {
        const snapped = findNearestPoint(world, aircraftPoints, area.snapRadius);
        if (snapped) target = snapped;
      }
      area.points[handle.index] = { x: target.x, y: target.y };
      markAreaDirty(area);
      return;
    }
    case "grid": {
      if (handle.kind !== "grid" || handle.row === undefined || handle.col === undefined) return;
      area.grid[handle.row]![handle.col] = { x: world.x, y: world.y };
      markAreaDirty(area);
      return;
    }
    case "gate": {
      if (handle.kind === "gate-rotate") {
        area.rotation = Math.atan2(world.y - area.center.y, world.x - area.center.x);
        markAreaDirty(area);
        return;
      }
      const cos = Math.cos(area.rotation);
      const sin = Math.sin(area.rotation);
      const dir = { x: cos, y: sin };
      const perp = { x: -sin, y: cos };
      const rel = { x: world.x - area.center.x, y: world.y - area.center.y };
      if (handle.kind === "gate-length") {
        const proj = rel.x * dir.x + rel.y * dir.y;
        area.length = Math.max(MIN_GATE_LENGTH, Math.abs(proj) * 2);
      }
      if (handle.kind === "gate-width") {
        const proj = rel.x * perp.x + rel.y * perp.y;
        area.width = Math.max(MIN_GATE_WIDTH, Math.abs(proj) * 2);
      }
      markAreaDirty(area);
      return;
    }
    case "ring": {
      if (handle.kind === "ring-radius") {
        const dist = Math.hypot(world.x - area.center.x, world.y - area.center.y);
        area.outerRadius = Math.max(MIN_RING_RADIUS, dist);
        area.innerRadius = Math.max(0.001, area.outerRadius * 0.65);
        markAreaDirty(area);
        return;
      }
      const angle = Math.atan2(world.y - area.center.y, world.x - area.center.x);
      if (handle.kind === "ring-angle-start") {
        area.startAngle = angle;
      } else if (handle.kind === "ring-angle-end") {
        area.endAngle = angle;
      }
      const normalized = normalizeArc(area.startAngle, area.endAngle);
      area.startAngle = normalized.start;
      area.endAngle = normalized.end;
      if (area.endAngle - area.startAngle < MIN_RING_SPAN) {
        area.endAngle = area.startAngle + MIN_RING_SPAN;
      }
      markAreaDirty(area);
      return;
    }
  }
}

function moveArea(area: EditableArea, dx: number, dy: number): void {
  switch (area.type) {
    case "ink":
    case "contours":
    case "magnetic":
    case "stamp":
    case "heat": {
      area.points = area.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      markAreaDirty(area);
      return;
    }
    case "grid": {
      area.grid = area.grid.map((row) => row.map((p) => ({ x: p.x + dx, y: p.y + dy })));
      markAreaDirty(area);
      return;
    }
    case "gate": {
      area.center = { x: area.center.x + dx, y: area.center.y + dy };
      markAreaDirty(area);
      return;
    }
    case "ring": {
      area.center = { x: area.center.x + dx, y: area.center.y + dy };
      markAreaDirty(area);
      return;
    }
  }
}

export function createEditableAreasState(): EditableAreasState {
  const AREA_COUNT = 100;
  const rng = (() => {
    let seed = 1337;
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const randRange = (min: number, max: number) => min + (max - min) * rng();
  const clampLat = (lat: number) => Math.max(-75, Math.min(75, lat));
  const pad = (value: number) => `${value + 1}`.padStart(2, "0");
  const randomCenter = () => ({
    lon: randRange(-170, 170),
    lat: randRange(-60, 60),
  });

  const worldScaleAt = (lon: number, lat: number) => {
    const base = lonLatToTessera(lon, lat);
    const dx = Math.abs(lonLatToTessera(lon + 1, lat).x - base.x);
    const dy = Math.abs(lonLatToTessera(lon, lat + 1).y - base.y);
    return { dx, dy, center: base };
  };

  const buildPolygon = (centerLon: number, centerLat: number, lonSize: number, latSize: number, points: number) => {
    const pts: Array<[number, number]> = [];
    const step = (Math.PI * 2) / points;
    for (let i = 0; i < points; i++) {
      const angle = i * step + randRange(-step * 0.35, step * 0.35);
      const rLon = lonSize * randRange(0.45, 1);
      const rLat = latSize * randRange(0.45, 1);
      const lon = centerLon + Math.cos(angle) * rLon;
      const lat = clampLat(centerLat + Math.sin(angle) * rLat);
      pts.push([lon, lat]);
    }
    return polygonFromLonLat(pts);
  };

  const areas: EditableArea[] = [];

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy } = worldScaleAt(center.lon, center.lat);
    const lonSize = randRange(0.7, 1.5);
    const latSize = randRange(0.5, 1.2);
    const points = buildPolygon(center.lon, center.lat, lonSize, latSize, 5 + Math.floor(randRange(0, 3)));
    const sizeWorld = Math.max(dx * lonSize, dy * latSize);
    areas.push({
      id: makeId("ink"),
      type: "ink",
      label: `Ink ${pad(i)}`,
      color: [0.2, 0.45, 0.9, 1],
      accent: [0.4, 0.7, 1, 1],
      version: 0,
      points,
      softness: sizeWorld * 0.35,
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy } = worldScaleAt(center.lon, center.lat);
    const lonSize = randRange(0.6, 1.2);
    const latSize = randRange(0.4, 1.0);
    const points = buildPolygon(center.lon, center.lat, lonSize, latSize, 5 + Math.floor(randRange(0, 3)));
    const sizeWorld = Math.max(dx * lonSize, dy * latSize);
    areas.push({
      id: makeId("contours"),
      type: "contours",
      label: `Contours ${pad(i)}`,
      color: [0.6, 0.2, 0.95, 1],
      accent: [0.7, 0.45, 1, 1],
      version: 0,
      points,
      bandCount: 3,
      bandSpacing: sizeWorld * 0.25,
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy } = worldScaleAt(center.lon, center.lat);
    const lonSize = randRange(0.5, 1.0);
    const latSize = randRange(0.4, 0.9);
    const points = buildPolygon(center.lon, center.lat, lonSize, latSize, 5 + Math.floor(randRange(0, 3)));
    const sizeWorld = Math.max(dx * lonSize, dy * latSize);
    areas.push({
      id: makeId("magnetic"),
      type: "magnetic",
      label: `Magnetic ${pad(i)}`,
      color: [0.15, 0.85, 0.6, 1],
      accent: [0.2, 0.95, 0.7, 1],
      version: 0,
      points,
      snapRadius: sizeWorld * 0.4,
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const lonSize = randRange(0.8, 1.4);
    const latSize = randRange(0.6, 1.1);
    const topLeft = lonLat(center.lon - lonSize, center.lat + latSize);
    const topRight = lonLat(center.lon + lonSize, center.lat + latSize);
    const bottomLeft = lonLat(center.lon - lonSize, center.lat - latSize);
    const bottomRight = lonLat(center.lon + lonSize, center.lat - latSize);
    areas.push({
      id: makeId("grid"),
      type: "grid",
      label: `Grid ${pad(i)}`,
      color: [0.95, 0.7, 0.2, 1],
      accent: [1, 0.85, 0.3, 1],
      version: 0,
      grid: createGridFromCorners(topLeft, topRight, bottomLeft, bottomRight, 4, 4),
      rows: 4,
      cols: 4,
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy } = worldScaleAt(center.lon, center.lat);
    const lonSize = randRange(0.5, 1.0);
    const latSize = randRange(0.4, 0.9);
    const points = buildPolygon(center.lon, center.lat, lonSize, latSize, 5 + Math.floor(randRange(0, 3)));
    const sizeWorld = Math.max(dx * lonSize, dy * latSize);
    areas.push({
      id: makeId("stamp"),
      type: "stamp",
      label: `Stamp ${pad(i)}`,
      color: [0.7, 0.3, 0.2, 1],
      accent: [0.95, 0.45, 0.35, 1],
      version: 0,
      points,
      stampSpacing: sizeWorld * 0.3,
      stampSize: sizeWorld * 0.1,
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy } = worldScaleAt(center.lon, center.lat);
    const lonSize = randRange(0.6, 1.1);
    const latSize = randRange(0.5, 1.0);
    const points = buildPolygon(center.lon, center.lat, lonSize, latSize, 5 + Math.floor(randRange(0, 3)));
    const sizeWorld = Math.max(dx * lonSize, dy * latSize);
    areas.push({
      id: makeId("heat"),
      type: "heat",
      label: `Heat ${pad(i)}`,
      color: [1, 0.3, 0.2, 1],
      accent: [1, 0.55, 0.3, 1],
      version: 0,
      points,
      flowAngle: randRange(0, Math.PI * 2),
      flowSpeed: randRange(0.02, 0.06),
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy, center: worldCenter } = worldScaleAt(center.lon, center.lat);
    const avgScale = (dx + dy) * 0.5;
    const length = avgScale * randRange(2.0, 5.0);
    const width = avgScale * randRange(0.8, 2.0);
    areas.push({
      id: makeId("gate"),
      type: "gate",
      label: `Gate ${pad(i)}`,
      color: [0.2, 0.6, 1, 1],
      accent: [0.4, 0.8, 1, 1],
      version: 0,
      center: worldCenter,
      length,
      width,
      rotation: randRange(-Math.PI, Math.PI),
    });
  }

  for (let i = 0; i < AREA_COUNT; i++) {
    const center = randomCenter();
    const { dx, dy, center: worldCenter } = worldScaleAt(center.lon, center.lat);
    const avgScale = (dx + dy) * 0.5;
    const outerRadius = avgScale * randRange(1.2, 3.5);
    const innerRadius = outerRadius * randRange(0.55, 0.7);
    const start = randRange(0, Math.PI * 2);
    const span = randRange(Math.PI * 0.5, Math.PI * 1.5);
    areas.push({
      id: makeId("ring"),
      type: "ring",
      label: `Ring ${pad(i)}`,
      color: [0.9, 0.2, 0.4, 1],
      accent: [1, 0.4, 0.55, 1],
      version: 0,
      center: worldCenter,
      innerRadius,
      outerRadius,
      startAngle: start,
      endAngle: start + span,
    });
  }

  return {
    areas,
    selectedId: null,
    activeHandle: null,
    dragState: null,
    enabled: true,
    cache: new Map(),
  };
}

export function setupEditableAreasControls(
  tessera: Tessera,
  canvas: HTMLCanvasElement,
  aircraftRenderer: AircraftRenderer,
  state: EditableAreasState
): EditableAreasState {
  const getPointer = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      screenX: (event.clientX - rect.left) * dpr,
      screenY: (event.clientY - rect.top) * dpr,
    };
  };

  const getWorld = (screenX: number, screenY: number) => {
    const matrix = tessera.camera.getMatrix(canvas.width, canvas.height);
    const world = screenToWorld(screenX, screenY, matrix, canvas.width, canvas.height);
    return { world, matrix };
  };

  const beginDrag = (event: MouseEvent, handle: HandlePosition | null, world: Vec2) => {
    if (handle) {
      state.selectedId = handle.handle.areaId;
      state.activeHandle = handle.handle;
      state.dragState = {
        areaId: handle.handle.areaId,
        mode: "handle",
        handle: handle.handle,
        lastWorld: { x: world.x, y: world.y },
      };
    } else {
      const hit = state.areas.find((area) => hitTestArea(area, world));
      if (!hit) {
        state.selectedId = null;
        state.activeHandle = null;
        state.dragState = null;
        return;
      }
      state.selectedId = hit.id;
      state.activeHandle = null;
      state.dragState = {
        areaId: hit.id,
        mode: "move",
        lastWorld: { x: world.x, y: world.y },
      };
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.style.cursor = "grabbing";
    tessera.requestRender();
  };

  canvas.addEventListener(
    "mousedown",
    (event) => {
      if (!state.enabled) return;
      if (event.button !== 0 || event.shiftKey) return;
      const { screenX, screenY } = getPointer(event);
      const { world, matrix } = getWorld(screenX, screenY);
      const handle = findHandleAtScreen(
        state.areas,
        screenX,
        screenY,
        matrix,
        canvas.width,
        canvas.height
      );
      beginDrag(event, handle, { x: world.worldX, y: world.worldY });
    },
    { capture: true }
  );

  window.addEventListener("mousemove", (event) => {
    if (!state.enabled) return;
    if (!state.dragState) return;
    const { screenX, screenY } = getPointer(event);
    const world = screenToWorld(screenX, screenY, tessera.camera.getMatrix(canvas.width, canvas.height), canvas.width, canvas.height);
    const area = state.areas.find((item) => item.id === state.dragState?.areaId);
    if (!area) return;

    if (state.dragState.mode === "move") {
      const dx = world.worldX - state.dragState.lastWorld.x;
      const dy = world.worldY - state.dragState.lastWorld.y;
      moveArea(area, dx, dy);
      state.dragState.lastWorld = { x: world.worldX, y: world.worldY };
    } else if (state.dragState.mode === "handle" && state.dragState.handle) {
      const aircraftPoints = aircraftRenderer.aircraft.map((ac) => ({ x: ac.x, y: ac.y }));
      applyHandleDrag(area, state.dragState.handle, { x: world.worldX, y: world.worldY }, aircraftPoints);
    }

    tessera.requestRender();
  });

  window.addEventListener("mouseup", () => {
    if (!state.enabled) return;
    if (state.dragState) {
      state.dragState = null;
      state.activeHandle = null;
      canvas.style.cursor = "grab";
      tessera.requestRender();
    }
  });

  return state;
}

export function renderEditableAreas(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  bounds: Bounds,
  timeSeconds: number,
  state: EditableAreasState,
  circleRenderer: SDFCircleRenderer | null
): void {
  const worldPerPixel = computeWorldPerPixel(bounds, w);
  const padding = worldPerPixel * 40;
  draw.save();
  for (const area of state.areas) {
    const areaBounds = getAreaBounds(area, state);
    if (!isBoundsVisible(areaBounds, bounds, padding)) continue;
    const cache = getAreaCache(area, state);
    switch (area.type) {
      case "ink":
        renderInkArea(draw, area, cache);
        break;
      case "contours":
        renderContourArea(draw, area, cache);
        break;
      case "magnetic":
        renderMagneticArea(draw, area, cache, timeSeconds, worldPerPixel, circleRenderer);
        break;
      case "grid":
        renderGridArea(draw, area, cache);
        break;
      case "stamp":
        renderStampArea(draw, area, cache, timeSeconds, worldPerPixel, circleRenderer);
        break;
      case "heat":
        renderHeatArea(draw, area, cache, timeSeconds);
        break;
      case "gate":
        renderGateArea(draw, area, cache);
        break;
      case "ring":
        renderRingArea(draw, area, cache, timeSeconds);
        break;
    }
  }
  draw.restore();
}

export function renderEditableAreaHandles(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  bounds: Bounds,
  state: EditableAreasState
): void {
  if (!state.selectedId) return;
  const area = state.areas.find((item) => item.id === state.selectedId);
  if (!area) return;

  const handles = getHandles(area);
  const worldPerPixel = computeWorldPerPixel(bounds, w);
  const handleRadius = HANDLE_RADIUS_PX * worldPerPixel;

  draw.begin(matrix, w, h);
  draw.lineWidth = 1;

  for (const { handle, position } of handles) {
    draw.fillStyle = state.activeHandle?.kind === handle.kind ? HANDLE_ACTIVE : HANDLE_FILL;
    draw.strokeStyle = HANDLE_STROKE;
    draw.beginPath();
    draw.arc(position.x, position.y, handleRadius, 0, TAU_CONST);
    draw.fill();
    draw.stroke();
  }

  draw.end();
}
