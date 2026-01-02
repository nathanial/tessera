/**
 * Shift-drag selection controller.
 */

import type { Tessera } from "../src/index";
import type { AircraftRenderer } from "./AircraftRenderer";
import {
  normalizeRect,
  projectSelectionItems,
  selectIdsInRect,
  type ScreenRect,
  type SelectionItemWorld,
} from "./SelectionUtils";

export interface SelectionState {
  isSelecting: boolean;
  isClicking: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  selectionRect: ScreenRect | null;
  selectedIds: Set<string>;
}

export function setupSelectionControls(
  tessera: Tessera,
  canvas: HTMLCanvasElement,
  aircraftRenderer: AircraftRenderer
): SelectionState {
  const state: SelectionState = {
    isSelecting: false,
    isClicking: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    selectionRect: null,
    selectedIds: new Set<string>(),
  };

  const getPointer = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    };
  };

  const updateRect = () => {
    state.selectionRect = normalizeRect(
      state.startX,
      state.startY,
      state.currentX,
      state.currentY
    );
  };

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !event.shiftKey) return;
    event.preventDefault();
    const pos = getPointer(event);
    state.isSelecting = true;
    state.startX = pos.x;
    state.startY = pos.y;
    state.currentX = pos.x;
    state.currentY = pos.y;
    updateRect();
    canvas.style.cursor = "crosshair";
  });

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.shiftKey) return;
    const pos = getPointer(event);
    state.isClicking = true;
    state.startX = pos.x;
    state.startY = pos.y;
    state.currentX = pos.x;
    state.currentY = pos.y;
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.isSelecting) return;
    const pos = getPointer(event);
    state.currentX = pos.x;
    state.currentY = pos.y;
    updateRect();
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.isClicking) return;
    const pos = getPointer(event);
    const dx = pos.x - state.startX;
    const dy = pos.y - state.startY;
    if (dx * dx + dy * dy > 16) {
      state.isClicking = false;
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (!state.isSelecting) return;
    const pos = getPointer(event);
    state.currentX = pos.x;
    state.currentY = pos.y;
    updateRect();

    const rect = state.selectionRect;
    state.isSelecting = false;
    state.selectionRect = null;
    canvas.style.cursor = "grab";

    if (!rect) {
      state.selectedIds.clear();
      return;
    }

    const matrix = tessera.camera.getMatrix(canvas.width, canvas.height);
    const bounds = tessera.camera.getVisibleBounds(canvas.width, canvas.height);
    const items: SelectionItemWorld[] = aircraftRenderer.aircraft.map((ac) => ({
      id: ac.icao24,
      x: ac.x,
      y: ac.y,
    }));
    const projected = projectSelectionItems(
      items,
      matrix,
      canvas.width,
      canvas.height,
      bounds,
      0
    );
    const selected = selectIdsInRect(projected, rect);

    state.selectedIds.clear();
    for (const id of selected) {
      state.selectedIds.add(id);
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (!state.isClicking || event.shiftKey || state.isSelecting) return;
    state.isClicking = false;
    state.selectedIds.clear();
  });

  return state;
}
