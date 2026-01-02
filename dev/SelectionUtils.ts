/**
 * Utilities for selection projection and rectangle tests.
 */

import { worldToScreen, getWrappedX } from "./CoordinateUtils";

export interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SelectionItemWorld {
  id: string;
  x: number;
  y: number;
}

export interface SelectionItemScreen {
  id: string;
  screenX: number;
  screenY: number;
}

export function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): ScreenRect {
  return {
    minX: Math.min(startX, endX),
    minY: Math.min(startY, endY),
    maxX: Math.max(startX, endX),
    maxY: Math.max(startY, endY),
  };
}

export function selectIdsInRect(
  items: SelectionItemScreen[],
  rect: ScreenRect,
  padding: number = 0
): Set<string> {
  const minX = rect.minX - padding;
  const minY = rect.minY - padding;
  const maxX = rect.maxX + padding;
  const maxY = rect.maxY + padding;
  const selected = new Set<string>();

  for (const item of items) {
    if (item.screenX < minX || item.screenX > maxX) continue;
    if (item.screenY < minY || item.screenY > maxY) continue;
    selected.add(item.id);
  }

  return selected;
}

export function projectSelectionItems(
  items: SelectionItemWorld[],
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  radius: number = 0
): SelectionItemScreen[] {
  const projected: SelectionItemScreen[] = [];
  for (const item of items) {
    const renderX = getWrappedX(item.x, radius, bounds.left, bounds.right);
    if (renderX === null) continue;
    const screen = worldToScreen(renderX, item.y, matrix, viewportWidth, viewportHeight);
    projected.push({
      id: item.id,
      screenX: screen.screenX,
      screenY: screen.screenY,
    });
  }
  return projected;
}

export function wrapWorldXNear(worldX: number, referenceX: number): number {
  let best = worldX;
  let bestDist = Math.abs(worldX - referenceX);
  for (const offset of [-1, 0, 1]) {
    const candidate = worldX + offset;
    const dist = Math.abs(candidate - referenceX);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
