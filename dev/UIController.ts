/**
 * UI overlay controller.
 * Handles stats display and debug grid rendering.
 */

import type { DrawContext, SDFRenderer } from "../src/index";
import { worldToScreen, screenToWorld } from "./CoordinateUtils";

// Text styling for stats overlay
export const statsStyle = {
  fontSize: 24,
  color: [1, 1, 1, 0.8] as [number, number, number, number],
  haloColor: [0, 0, 0, 0.9] as [number, number, number, number],
  haloWidth: 2,
  align: "left" as const,
};

// ============================================
// DEBUG GRID
// ============================================

/**
 * Render debug grid overlay showing clustering cells.
 */
export function renderDebugGrid(
  draw: DrawContext,
  matrix: Float32Array,
  w: number,
  h: number,
  cellSize: number
): void {
  // Anchor grid to world origin so it pans smoothly with content
  const origin = worldToScreen(0, 0, matrix, w, h);
  const offsetX = ((origin.screenX % cellSize) + cellSize) % cellSize;
  const offsetY = ((origin.screenY % cellSize) + cellSize) % cellSize;

  draw.begin(matrix, w, h);
  draw.strokeStyle = [1, 1, 0, 0.3]; // Yellow, semi-transparent
  draw.lineWidth = 1;

  // Draw vertical lines
  for (let x = offsetX; x <= w; x += cellSize) {
    const top = screenToWorld(x, 0, matrix, w, h);
    const bottom = screenToWorld(x, h, matrix, w, h);
    draw.beginPath();
    draw.moveTo(top.worldX, top.worldY);
    draw.lineTo(bottom.worldX, bottom.worldY);
    draw.stroke();
  }

  // Draw horizontal lines
  for (let y = offsetY; y <= h; y += cellSize) {
    const left = screenToWorld(0, y, matrix, w, h);
    const right = screenToWorld(w, y, matrix, w, h);
    draw.beginPath();
    draw.moveTo(left.worldX, left.worldY);
    draw.lineTo(right.worldX, right.worldY);
    draw.stroke();
  }

  draw.end();
}

// ============================================
// STATS OVERLAY
// ============================================

/**
 * Render stats overlay in top-left corner.
 */
export function renderStatsOverlay(
  draw: DrawContext,
  sdfRenderer: SDFRenderer,
  matrix: Float32Array,
  w: number,
  h: number,
  zoom: number
): void {
  const stats = draw.getStats();
  const statsText = `batches: ${stats.batches}  instances: ${stats.instances}  zoom: ${zoom.toFixed(1)}`;

  // Draw background for stats
  const statsPadding = 8;
  const statsHeight = 24 + statsPadding * 2;
  const statsWidth = statsText.length * 14 + statsPadding * 2;

  draw.begin(matrix, w, h);
  draw.fillStyle = [0, 0, 0, 1];
  const bgTopLeft = screenToWorld(0, 0, matrix, w, h);
  const bgBottomRight = screenToWorld(statsWidth, statsHeight, matrix, w, h);
  draw.fillRect(
    bgTopLeft.worldX,
    bgTopLeft.worldY,
    bgBottomRight.worldX - bgTopLeft.worldX,
    bgBottomRight.worldY - bgTopLeft.worldY
  );
  draw.end();

  const statsWorld = screenToWorld(statsPadding, statsHeight - statsPadding, matrix, w, h);
  sdfRenderer.addText(statsText, statsWorld.worldX, statsWorld.worldY, statsStyle);
}
