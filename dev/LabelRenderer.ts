/**
 * Label rendering layer.
 * Handles aircraft label placement, leader lines, and callout boxes.
 */

import type { DrawContext, SDFRenderer, TextLayout } from "../src/index";
import { LabelPlacer, type LabelItem, type PlacementResult } from "./labels";
import { worldToScreen, screenToWorld, getWrappedX } from "./CoordinateUtils";
import type { AircraftRenderer } from "./AircraftRenderer";

// ============================================
// LABEL CONFIGURATION
// ============================================

export const LABEL_FONT_SIZE = 18;
export const LABEL_CHAR_WIDTH = 0.55;

// Text styling for aircraft labels
export const labelStyle = {
  fontSize: LABEL_FONT_SIZE,
  color: [1, 1, 1, 1] as [number, number, number, number],
  haloColor: [0, 0, 0, 0.8] as [number, number, number, number],
  haloWidth: 2,
  align: "left" as const,
};

// ============================================
// LABEL RENDERER CLASS
// ============================================

export class LabelRenderer {
  readonly labelPlacer: LabelPlacer;

  constructor() {
    this.labelPlacer = new LabelPlacer({
      fontSize: LABEL_FONT_SIZE,
      charWidth: LABEL_CHAR_WIDTH,
      calloutThreshold: 4,
      maxCalloutLabels: 5,
    });
  }

  /** Set the text measurement function (once font atlas is loaded). */
  setMeasureFunction(
    measureFn: (text: string, fontSize: number) => number
  ): void {
    this.labelPlacer.setMeasureFunction(measureFn);
  }

  /**
   * Render labels for visible aircraft.
   * Handles direct labels, leader labels, and stacked callouts.
   */
  render(
    draw: DrawContext,
    sdfRenderer: SDFRenderer,
    aircraftRenderer: AircraftRenderer,
    matrix: Float32Array,
    w: number,
    h: number,
    bounds: { left: number; right: number; top: number; bottom: number },
    aircraftSize: number,
    zoom: number,
    isZooming: boolean
  ): void {
    sdfRenderer.clearText();

    // Hide labels completely below zoom 5.5 or during zoom animation
    const showLabels = zoom >= 5.5 && !isZooming;
    if (!showLabels) return;

    // Convert aircraft to label items
    const labelItems: LabelItem[] = aircraftRenderer.aircraft
      .filter(ac => {
        // Y culling
        if (ac.y < bounds.top || ac.y > bounds.bottom) return false;
        // X culling with wrapping
        return getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right) !== null;
      })
      .map(ac => {
        const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right)!;
        return {
          id: ac.icao24,
          text: ac.callsign || ac.icao24,
          anchorX: renderX,
          anchorY: ac.y,
          priority: ac.callsign ? 1 : 0,
        };
      });

    // Create world-to-screen converter
    const worldToScreenFn = (x: number, y: number) => worldToScreen(x, y, matrix, w, h);

    // Compute label offset in pixels
    const viewWidth = bounds.right - bounds.left;
    const pixelsPerWorldUnit = w / viewWidth;
    const labelOffsetPixels = aircraftSize * pixelsPerWorldUnit * 1.2;

    // Calculate grid offset to anchor clustering to world coordinates
    const cellSize = this.labelPlacer.getClusterCellSize();
    const origin = worldToScreen(0, 0, matrix, w, h);
    const gridOffset = {
      x: ((origin.screenX % cellSize) + cellSize) % cellSize,
      y: ((origin.screenY % cellSize) + cellSize) % cellSize,
    };

    // Place labels with overlap resolution
    const placement = this.labelPlacer.place(labelItems, worldToScreenFn, w, h, labelOffsetPixels, gridOffset);

    // Render direct labels (no leader line)
    for (const label of placement.directLabels) {
      const world = screenToWorld(label.screenX, label.screenY + LABEL_FONT_SIZE / 2, matrix, w, h);
      sdfRenderer.addText(label.item.text, world.worldX, world.worldY, labelStyle);
    }

    // Render leader labels (with leader lines)
    draw.begin(matrix, w, h);
    draw.strokeStyle = [1, 1, 1, 0.5];
    draw.lineWidth = 1;

    for (const label of placement.leaderLabels) {
      const anchorWorld = screenToWorld(label.anchorScreenX, label.anchorScreenY, matrix, w, h);
      const labelWorld = screenToWorld(label.screenX, label.screenY + LABEL_FONT_SIZE / 2, matrix, w, h);

      draw.beginPath();
      draw.moveTo(anchorWorld.worldX, anchorWorld.worldY);
      draw.lineTo(labelWorld.worldX, labelWorld.worldY);
      draw.stroke();

      sdfRenderer.addText(label.item.text, labelWorld.worldX, labelWorld.worldY, labelStyle);
    }

    draw.end();

    // Render stacked callouts
    this.renderCallouts(draw, sdfRenderer, placement, matrix, w, h);
  }

  private renderCallouts(
    draw: DrawContext,
    sdfRenderer: SDFRenderer,
    placement: PlacementResult,
    matrix: Float32Array,
    w: number,
    h: number
  ): void {
    if (placement.callouts.length === 0) return;

    // First pass: draw all branching lines (rendered under boxes)
    draw.begin(matrix, w, h);
    for (const callout of placement.callouts) {
      const boxCenterX = callout.boxX + callout.boxWidth / 2;
      const boxCenterY = callout.boxY + callout.boxHeight / 2;
      const boxCenter = screenToWorld(boxCenterX, boxCenterY, matrix, w, h);
      const centroid = screenToWorld(callout.centroidX, callout.centroidY, matrix, w, h);

      draw.strokeStyle = [1, 1, 1, 0.5];
      draw.lineWidth = 1;

      // Draw main trunk from box center to centroid
      draw.beginPath();
      draw.moveTo(boxCenter.worldX, boxCenter.worldY);
      draw.lineTo(centroid.worldX, centroid.worldY);
      draw.stroke();

      // Draw branches from centroid to each aircraft
      draw.strokeStyle = [1, 1, 1, 0.4];
      for (const acPoint of callout.aircraftPoints) {
        const acWorld = screenToWorld(acPoint.screenX, acPoint.screenY, matrix, w, h);
        draw.beginPath();
        draw.moveTo(centroid.worldX, centroid.worldY);
        draw.lineTo(acWorld.worldX, acWorld.worldY);
        draw.stroke();
      }
    }
    draw.end();

    // Second pass: draw all callout boxes (rendered on top of lines)
    draw.begin(matrix, w, h);
    for (const callout of placement.callouts) {
      const boxTopLeft = screenToWorld(callout.boxX, callout.boxY, matrix, w, h);
      const boxBottomRight = screenToWorld(
        callout.boxX + callout.boxWidth,
        callout.boxY + callout.boxHeight,
        matrix, w, h
      );

      // Draw callout box background
      draw.fillStyle = [0.1, 0.1, 0.1, 1.0];
      draw.fillRect(
        boxTopLeft.worldX,
        boxTopLeft.worldY,
        boxBottomRight.worldX - boxTopLeft.worldX,
        boxBottomRight.worldY - boxTopLeft.worldY
      );

      // Draw callout box border
      draw.strokeStyle = [1, 1, 1, 0.6];
      draw.lineWidth = 1;
      draw.strokeRect(
        boxTopLeft.worldX,
        boxTopLeft.worldY,
        boxBottomRight.worldX - boxTopLeft.worldX,
        boxBottomRight.worldY - boxTopLeft.worldY
      );

      // Add text labels inside callout
      const lineHeight = LABEL_FONT_SIZE * 1.2;
      const padding = 4;
      for (let i = 0; i < callout.items.length; i++) {
        const textY = callout.boxY + padding + (i + 0.5) * lineHeight;
        const textWorld = screenToWorld(callout.boxX + padding, textY, matrix, w, h);
        sdfRenderer.addText(callout.items[i]!.text, textWorld.worldX, textWorld.worldY, labelStyle);
      }
    }
    draw.end();
  }

  /** Get cluster cell size for debug grid rendering. */
  getClusterCellSize(): number {
    return this.labelPlacer.getClusterCellSize();
  }
}
