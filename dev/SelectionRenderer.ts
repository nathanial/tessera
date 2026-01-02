/**
 * Selection rendering for rings, destination lines, and selection rectangle.
 */

import type { DrawContext } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import type { SelectionState } from "./SelectionController";
import { getWrappedX, screenToWorld, worldToScreen } from "./CoordinateUtils";
import { wrapWorldXNear } from "./SelectionUtils";
import type { DashedLineRenderer, DashedRingRenderer } from "./DashedSelectionRenderers";

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
