/**
 * Selection rendering for rings, destination lines, and selection rectangle.
 */

import type { DrawContext } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import type { SelectionState } from "./SelectionController";
import { getWrappedX, screenToWorld, worldToScreen } from "./CoordinateUtils";
import { wrapWorldXNear } from "./SelectionUtils";

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

function drawDashedLineScreen(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  dashLength: number,
  gapLength: number
): void {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.01) return;

  const dirX = dx / distance;
  const dirY = dy / distance;
  let traveled = 0;

  draw.beginPath();
  while (traveled < distance) {
    const segmentStart = traveled;
    const segmentEnd = Math.min(traveled + dashLength, distance);
    const sx1 = startX + dirX * segmentStart;
    const sy1 = startY + dirY * segmentStart;
    const sx2 = startX + dirX * segmentEnd;
    const sy2 = startY + dirY * segmentEnd;
    const w1 = screenToWorld(sx1, sy1, matrix, w, h);
    const w2 = screenToWorld(sx2, sy2, matrix, w, h);
    draw.moveTo(w1.worldX, w1.worldY);
    draw.lineTo(w2.worldX, w2.worldY);
    traveled += dashLength + gapLength;
  }
  draw.stroke();
}

function drawDashedCircleScreen(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  centerX: number,
  centerY: number,
  radius: number,
  dashLength: number,
  gapLength: number,
  timeSeconds: number,
  speed: number
): void {
  if (radius <= 0.5) return;
  const cycle = dashLength + gapLength;
  const phasePx = (timeSeconds * speed) % cycle;
  const phaseAngle = phasePx / radius;
  const dashAngle = dashLength / radius;
  const cycleAngle = cycle / radius;

  draw.beginPath();
  for (let angle = -phaseAngle; angle < Math.PI * 2 - phaseAngle; angle += cycleAngle) {
    const startAngle = angle;
    const endAngle = Math.min(angle + dashAngle, Math.PI * 2 - phaseAngle);
    const sx1 = centerX + Math.cos(startAngle) * radius;
    const sy1 = centerY + Math.sin(startAngle) * radius;
    const sx2 = centerX + Math.cos(endAngle) * radius;
    const sy2 = centerY + Math.sin(endAngle) * radius;
    const w1 = screenToWorld(sx1, sy1, matrix, w, h);
    const w2 = screenToWorld(sx2, sy2, matrix, w, h);
    draw.moveTo(w1.worldX, w1.worldY);
    draw.lineTo(w2.worldX, w2.worldY);
  }
  draw.stroke();
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
  timeSeconds: number
): void {
  if (selectedIds.size === 0) return;

  draw.begin(matrix, w, h);
  draw.strokeStyle = destinationLineStroke;
  draw.lineWidth = 1;

  for (const ac of aircraftRenderer.aircraft) {
    if (!selectedIds.has(ac.icao24)) continue;
    const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
    if (renderX === null) continue;
    const destX = wrapWorldXNear(ac.destX, renderX);
    const startScreen = worldToScreen(renderX, ac.y, matrix, w, h);
    const endScreen = worldToScreen(destX, ac.destY, matrix, w, h);
    drawDashedLineScreen(
      draw,
      matrix,
      w,
      h,
      startScreen.screenX,
      startScreen.screenY,
      endScreen.screenX,
      endScreen.screenY,
      destinationDashLength,
      destinationGapLength
    );
  }

  draw.end();

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

  draw.begin(matrix, w, h);
  draw.strokeStyle = selectionDashStroke;
  draw.lineWidth = 1.5;

  for (const ac of aircraftRenderer.aircraft) {
    if (!selectedIds.has(ac.icao24)) continue;
    const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
    if (renderX === null) continue;
    const centerScreen = worldToScreen(renderX, ac.y, matrix, w, h);
    const radiusWorld = aircraftSize * 2.6;
    const edgeScreen = worldToScreen(renderX + radiusWorld, ac.y, matrix, w, h);
    const radiusScreen = Math.abs(edgeScreen.screenX - centerScreen.screenX);
    drawDashedCircleScreen(
      draw,
      matrix,
      w,
      h,
      centerScreen.screenX,
      centerScreen.screenY,
      radiusScreen,
      selectionDashLength,
      selectionGapLength,
      timeSeconds,
      selectionDashSpeed
    );
  }

  draw.end();
}
