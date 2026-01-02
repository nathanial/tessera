/**
 * Selection rendering for rings, destination lines, and selection rectangle.
 */

import type { DrawContext, TextStyle } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import type { SelectionState } from "./SelectionController";
import { getWrappedX, screenToWorld, worldToScreen } from "./CoordinateUtils";
import { wrapWorldXNear } from "./SelectionUtils";
import type { DashedLineRenderer, DashedRingRenderer } from "./DashedSelectionRenderers";
import { convexHull, offsetConvexPolygon, type HullPoint } from "./ConvexHull";
import type { CommandGroup } from "./adsb";

const selectionBoxFill: [number, number, number, number] = [0.1, 0.6, 1, 0.12];
const selectionBoxStroke: [number, number, number, number] = [0.1, 0.6, 1, 0.8];
const selectionRingStroke: [number, number, number, number] = [1, 1, 1, 0.9];
const selectionDashStroke: [number, number, number, number] = [0.15, 0.9, 0.2, 0.9];
const destinationLineStroke: [number, number, number, number] = [0.15, 0.9, 0.2, 0.7];
const destinationDashLength = 10;
const destinationGapLength = 8;
const selectionDashLength = 8;
const selectionGapLength = 6;
const selectionDashSpeed = 30; // pixels per second
const selectionDashThickness = 1.5;
const hullStroke: [number, number, number, number] = [0.1, 0.8, 0.2, 0.45];
const hullArrowFill: [number, number, number, number] = [0.15, 0.9, 0.2, 0.9];
const hullLineWidth = 5;
const hullPaddingPixels = 20;
const hullLineDashLength = 16;
const hullLineGapLength = 12;
const hullDashLineWidth = 2.5;
const hullArrowLengthPixels = 16;
const hullArrowWidthPixels = 12;
const commandLabelStyle: TextStyle = {
  fontSize: 32,
  color: [0.15, 0.9, 0.2, 1],
  haloColor: [0, 0, 0, 0.8],
  haloWidth: 2,
  align: "center",
};

export interface CommandGroupLabel {
  text: string;
  x: number;
  y: number;
}

interface CommandGroupArrow {
  tipX: number;
  tipY: number;
  dirX: number;
  dirY: number;
}

function polygonCentroid(points: HullPoint[]): HullPoint {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    const count = points.length || 1;
    return { x: sumX / count, y: sumY / count };
  }
  const factor = 1 / (3 * area);
  return { x: cx * factor, y: cy * factor };
}

function buildGroupHull(points: HullPoint[], padding: number): HullPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0]!;
    return [
      { x: p.x - padding, y: p.y - padding },
      { x: p.x + padding, y: p.y - padding },
      { x: p.x + padding, y: p.y + padding },
      { x: p.x - padding, y: p.y + padding },
    ];
  }
  if (points.length === 2) {
    const p0 = points[0]!;
    const p1 = points[1]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return [
        { x: p0.x - padding, y: p0.y - padding },
        { x: p0.x + padding, y: p0.y - padding },
        { x: p0.x + padding, y: p0.y + padding },
        { x: p0.x - padding, y: p0.y + padding },
      ];
    }
    const nx = -dy / len;
    const ny = dx / len;
    return [
      { x: p0.x + nx * padding, y: p0.y + ny * padding },
      { x: p1.x + nx * padding, y: p1.y + ny * padding },
      { x: p1.x - nx * padding, y: p1.y - ny * padding },
      { x: p0.x - nx * padding, y: p0.y - ny * padding },
    ];
  }

  const hull = convexHull(points);
  if (hull.length < 3) return hull;
  return padding > 0 ? offsetConvexPolygon(hull, padding) : hull;
}

export function renderSelectionBox(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  selection: SelectionState
): void {
  if (!selection.isSelecting || !selection.selectionRect) return;
  const rect = selection.selectionRect;
  const topLeft = screenToWorld(rect.minX, rect.minY, matrix, w, h);
  const bottomRight = screenToWorld(rect.maxX, rect.maxY, matrix, w, h);

  draw.begin(matrix, w, h);
  draw.fillStyle = selectionBoxFill;
  draw.strokeStyle = selectionBoxStroke;
  draw.lineWidth = 1;
  draw.fillRect(
    topLeft.worldX,
    topLeft.worldY,
    bottomRight.worldX - topLeft.worldX,
    bottomRight.worldY - topLeft.worldY
  );
  draw.strokeRect(
    topLeft.worldX,
    topLeft.worldY,
    bottomRight.worldX - topLeft.worldX,
    bottomRight.worldY - topLeft.worldY
  );
  draw.end();
}

export function renderSelectionHighlights(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  aircraftRenderer: AircraftRenderer,
  aircraftSize: number,
  selectedIds: Set<string>,
  timeSeconds: number,
  lineRenderer: DashedLineRenderer,
  ringRenderer: DashedRingRenderer
): void {
  if (selectedIds.size === 0) return;

  lineRenderer.begin(w, h);
  ringRenderer.begin(w, h);

  for (const ac of aircraftRenderer.aircraft) {
    if (!selectedIds.has(ac.icao24)) continue;
    const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
    if (renderX === null) continue;
    const destX = wrapWorldXNear(ac.destX, renderX);
    const startScreen = worldToScreen(renderX, ac.y, matrix, w, h);
    const endScreen = worldToScreen(destX, ac.destY, matrix, w, h);
    lineRenderer.addLine(
      startScreen.screenX,
      startScreen.screenY,
      endScreen.screenX,
      endScreen.screenY,
      1,
      destinationDashLength,
      destinationGapLength,
      0,
      destinationLineStroke
    );

    const centerScreen = startScreen;
    const radiusWorld = aircraftSize * 2.6;
    const edgeScreen = worldToScreen(renderX + radiusWorld, ac.y, matrix, w, h);
    const radiusScreen = Math.abs(edgeScreen.screenX - centerScreen.screenX);
    ringRenderer.addRing(
      centerScreen.screenX,
      centerScreen.screenY,
      radiusScreen,
      selectionDashThickness,
      selectionDashLength,
      selectionGapLength,
      timeSeconds * selectionDashSpeed,
      selectionDashStroke
    );
  }

  lineRenderer.render();

  draw.begin(matrix, w, h);
  draw.strokeStyle = selectionRingStroke;
  draw.lineWidth = 2;

  for (const ac of aircraftRenderer.aircraft) {
    if (!selectedIds.has(ac.icao24)) continue;
    const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
    if (renderX === null) continue;
    draw.beginPath();
    draw.arc(renderX, ac.y, aircraftSize * 2, 0, Math.PI * 2);
    draw.stroke();
  }

  draw.end();

  ringRenderer.render();
}

export function renderCommandHulls(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  aircraftRenderer: AircraftRenderer,
  groups: CommandGroup[],
  lineRenderer: DashedLineRenderer,
  timeSeconds: number
): CommandGroupLabel[] {
  if (groups.length === 0) return [];

  const refX = (bounds.left + bounds.right) / 2;
  const aircraftMap = new Map<string, HullPoint>();
  for (const ac of aircraftRenderer.aircraft) {
    const wrappedX = wrapWorldXNear(ac.x, refX);
    aircraftMap.set(ac.icao24, { x: wrappedX, y: ac.y });
  }

  const labels: CommandGroupLabel[] = [];
  const arrows: CommandGroupArrow[] = [];
  lineRenderer.begin(w, h);

  draw.begin(matrix, w, h);
  draw.strokeStyle = hullStroke;
  draw.lineWidth = hullLineWidth;

  const viewWidth = bounds.right - bounds.left;
  const viewHeight = bounds.bottom - bounds.top;
  const worldPerPixel = Math.min(viewWidth / w, viewHeight / h);
  const hullPadding = hullPaddingPixels * worldPerPixel;

  for (const group of groups) {
    const points: HullPoint[] = [];
    for (const id of group.memberIds) {
      const point = aircraftMap.get(id);
      if (point) points.push(point);
    }
    if (points.length === 0) continue;
    const paddedHull = buildGroupHull(points, hullPadding);
    if (paddedHull.length < 3) continue;
    const centroid = polygonCentroid(paddedHull);
    const labelText = group.id.startsWith("go-") ? `Group ${group.id.slice(3)}` : group.id;
    labels.push({ text: labelText, x: centroid.x, y: centroid.y });

    const destX = wrapWorldXNear(group.destX, centroid.x);
    const destY = group.destY;
    const dx = destX - centroid.x;
    const dy = destY - centroid.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      arrows.push({
        tipX: destX,
        tipY: destY,
        dirX: dx / len,
        dirY: dy / len,
      });
    }
    const centerScreen = worldToScreen(centroid.x, centroid.y, matrix, w, h);
    const destScreen = worldToScreen(destX, destY, matrix, w, h);
    lineRenderer.addLine(
      centerScreen.screenX,
      centerScreen.screenY,
      destScreen.screenX,
      destScreen.screenY,
      hullDashLineWidth,
      hullLineDashLength,
      hullLineGapLength,
      timeSeconds * selectionDashSpeed,
      hullStroke
    );

    draw.beginPath();
    draw.moveTo(paddedHull[0]!.x, paddedHull[0]!.y);
    for (let i = 1; i < paddedHull.length; i++) {
      draw.lineTo(paddedHull[i]!.x, paddedHull[i]!.y);
    }
    draw.closePath();
    draw.stroke();
  }

  draw.end();
  lineRenderer.render();

  if (arrows.length > 0) {
    const arrowLength = hullArrowLengthPixels * worldPerPixel;
    const arrowHalfWidth = (hullArrowWidthPixels * worldPerPixel) / 2;
    draw.begin(matrix, w, h);
    draw.fillStyle = hullArrowFill;
    for (const arrow of arrows) {
      const baseX = arrow.tipX - arrow.dirX * arrowLength;
      const baseY = arrow.tipY - arrow.dirY * arrowLength;
      const perpX = -arrow.dirY;
      const perpY = arrow.dirX;
      const leftX = baseX + perpX * arrowHalfWidth;
      const leftY = baseY + perpY * arrowHalfWidth;
      const rightX = baseX - perpX * arrowHalfWidth;
      const rightY = baseY - perpY * arrowHalfWidth;
      draw.beginPath();
      draw.moveTo(arrow.tipX, arrow.tipY);
      draw.lineTo(leftX, leftY);
      draw.lineTo(rightX, rightY);
      draw.closePath();
      draw.fill();
    }
    draw.end();
  }
  return labels;
}

export function getCommandLabelStyle(): TextStyle {
  return commandLabelStyle;
}
