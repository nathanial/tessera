/**
 * Selection rendering for rings, destination lines, and selection rectangle.
 */

import type { DrawContext } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import type { SelectionState } from "./SelectionController";
import { getWrappedX, screenToWorld } from "./CoordinateUtils";
import { wrapWorldXNear } from "./SelectionUtils";

const selectionBoxFill: [number, number, number, number] = [0.1, 0.6, 1, 0.12];
const selectionBoxStroke: [number, number, number, number] = [0.1, 0.6, 1, 0.8];
const selectionRingStroke: [number, number, number, number] = [1, 1, 1, 0.9];
const destinationLineStroke: [number, number, number, number] = [0.15, 0.9, 0.2, 0.7];

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
  selectedIds: Set<string>
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
    draw.beginPath();
    draw.moveTo(renderX, ac.y);
    draw.lineTo(destX, ac.destY);
    draw.stroke();
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
}
