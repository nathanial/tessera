/**
 * Label placement system with stacked callouts
 *
 * Handles overlap detection and creates:
 * - Direct labels (no overlap)
 * - Leader lines (for displaced labels)
 * - Stacked callouts (for dense clusters)
 */

import { SpatialGrid } from "./SpatialGrid";
import type { BoundingBox } from "./SpatialGrid";
import {
  DEFAULT_OPTIONS,
  LEADER_OFFSETS,
  type LabelItem,
  type PlacedLabel,
  type StackedCallout,
  type PlacementResult,
  type PlacementOptions,
  type TextMeasureFn,
  type CachedCallout,
  type CachedPlacement,
} from "./LabelTypes";

// Re-export types for external consumers
export type { LabelItem, PlacedLabel, StackedCallout, PlacementResult, PlacementOptions, TextMeasureFn, BoundingBox };

export class LabelPlacer {
  private options: PlacementOptions;
  private grid: SpatialGrid;
  private widthCache: Map<string, number> = new Map();
  private measureFn?: TextMeasureFn;

  // Hysteresis state for stable clustering
  private prevClusterAssignments: Map<string, string> = new Map();
  private prevCalloutPositions: Map<string, CachedCallout> = new Map();
  private prevPlacements: Map<string, CachedPlacement> = new Map();
  private newPlacements: Map<string, CachedPlacement> = new Map();

  constructor(options: Partial<PlacementOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.grid = new SpatialGrid(this.options.fontSize * 4);
  }

  /**
   * Set the text measurement function (e.g., from TextLayout.measureLine)
   */
  setMeasureFunction(fn: TextMeasureFn): void {
    this.measureFn = fn;
    this.widthCache.clear();
  }

  updateOptions(options: Partial<PlacementOptions>): void {
    this.options = { ...this.options, ...options };
    this.grid = new SpatialGrid(this.options.fontSize * 4);
  }

  /**
   * Clear hysteresis state. Call on significant zoom changes or data refresh.
   */
  clearState(): void {
    this.prevClusterAssignments.clear();
    this.prevCalloutPositions.clear();
    this.prevPlacements.clear();
    this.newPlacements.clear();
  }

  /**
   * Get the cluster cell size in screen pixels.
   * Useful for debug visualization.
   */
  getClusterCellSize(): number {
    return this.options.fontSize * 12;
  }

  /**
   * Place labels with overlap resolution
   */
  place(
    items: LabelItem[],
    worldToScreen: (x: number, y: number) => { screenX: number; screenY: number },
    viewportWidth: number,
    viewportHeight: number,
    labelOffsetX: number = 10,
    gridOffset: { x: number; y: number } = { x: 0, y: 0 }
  ): PlacementResult {
    this.grid.clear();
    this.newPlacements.clear();

    const directLabels: PlacedLabel[] = [];
    const displaced: PlacedLabel[] = [];

    // Sort by priority (higher first)
    const sorted = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // First pass: try direct placement with hysteresis
    for (const item of sorted) {
      const anchor = worldToScreen(item.anchorX, item.anchorY);

      // Skip if anchor is off-screen
      if (anchor.screenX < -100 || anchor.screenX > viewportWidth + 100 ||
          anchor.screenY < -100 || anchor.screenY > viewportHeight + 100) {
        continue;
      }

      const labelWidth = this.measureText(item.text);
      const labelHeight = this.options.fontSize * this.options.lineHeight;

      // Try preferred position (right of anchor)
      const preferredX = anchor.screenX + labelOffsetX;
      const preferredY = anchor.screenY - labelHeight / 2;

      const bounds: BoundingBox = {
        x: preferredX - this.options.padding,
        y: preferredY - this.options.padding,
        width: labelWidth + this.options.padding * 2,
        height: labelHeight + this.options.padding * 2,
      };

      const prevPlacement = this.prevPlacements.get(item.id);
      const wasDirect = prevPlacement?.type === 'direct';
      const hasOverlap = this.grid.hasOverlap(bounds);

      if (!hasOverlap || (wasDirect && hasOverlap)) {
        if (!hasOverlap) {
          this.grid.insert(bounds);
          directLabels.push({
            item,
            screenX: preferredX,
            screenY: preferredY,
            anchorScreenX: anchor.screenX,
            anchorScreenY: anchor.screenY,
            needsLeaderLine: false,
            bounds,
          });
          this.newPlacements.set(item.id, { type: 'direct' });
        } else {
          displaced.push({
            item,
            screenX: preferredX,
            screenY: preferredY,
            anchorScreenX: anchor.screenX,
            anchorScreenY: anchor.screenY,
            needsLeaderLine: true,
            bounds,
          });
        }
      } else {
        displaced.push({
          item,
          screenX: preferredX,
          screenY: preferredY,
          anchorScreenX: anchor.screenX,
          anchorScreenY: anchor.screenY,
          needsLeaderLine: true,
          bounds,
        });
      }
    }

    // Second pass: cluster displaced labels and create callouts
    const { leaderLabels, callouts, newClusterAssignments } = this.resolveDisplaced(
      displaced,
      viewportWidth,
      viewportHeight,
      gridOffset
    );

    // Update hysteresis state
    this.prevClusterAssignments = newClusterAssignments;

    this.prevCalloutPositions.clear();
    for (const callout of callouts) {
      const key = callout.items.map(i => i.id).sort().join(',');
      this.prevCalloutPositions.set(key, {
        boxX: callout.boxX,
        boxY: callout.boxY,
        boxWidth: callout.boxWidth,
        boxHeight: callout.boxHeight,
        centroidX: callout.centroidX,
        centroidY: callout.centroidY,
      });
    }

    this.prevPlacements = this.newPlacements;
    this.newPlacements = new Map();

    return { directLabels, leaderLabels, callouts };
  }

  private measureText(text: string): number {
    const fontSize = this.options.fontSize;
    const key = `${text}:${fontSize}`;
    const cached = this.widthCache.get(key);
    if (cached !== undefined) return cached;

    let width: number;
    if (this.measureFn) {
      width = this.measureFn(text, fontSize);
    } else {
      width = text.length * fontSize * this.options.charWidth;
    }

    this.widthCache.set(key, width);
    return width;
  }

  private resolveDisplaced(
    displaced: PlacedLabel[],
    viewportWidth: number,
    viewportHeight: number,
    gridOffset: { x: number; y: number }
  ): { leaderLabels: PlacedLabel[]; callouts: StackedCallout[]; newClusterAssignments: Map<string, string> } {
    if (displaced.length === 0) {
      return { leaderLabels: [], callouts: [], newClusterAssignments: new Map() };
    }

    const clusterGrid = new Map<string, PlacedLabel[]>();
    const clusterCellSize = this.options.fontSize * 12;
    const newClusterAssignments = new Map<string, string>();

    for (const label of displaced) {
      const cx = Math.floor((label.anchorScreenX - gridOffset.x) / clusterCellSize);
      const cy = Math.floor((label.anchorScreenY - gridOffset.y) / clusterCellSize);
      const currentKey = `${cx},${cy}`;

      const prevKey = this.prevClusterAssignments.get(label.item.id);
      let key = currentKey;

      if (prevKey && prevKey !== currentKey) {
        const [prevCxStr, prevCyStr] = prevKey.split(',');
        const prevCx = Number(prevCxStr);
        const prevCy = Number(prevCyStr);
        const prevCenterX = (prevCx + 0.5) * clusterCellSize + gridOffset.x;
        const prevCenterY = (prevCy + 0.5) * clusterCellSize + gridOffset.y;

        const distToPrevCenter = Math.hypot(
          label.anchorScreenX - prevCenterX,
          label.anchorScreenY - prevCenterY
        );

        if (distToPrevCenter < clusterCellSize / 2 + this.options.hysteresisMargin) {
          key = prevKey;
        }
      }

      newClusterAssignments.set(label.item.id, key);

      let cluster = clusterGrid.get(key);
      if (!cluster) {
        cluster = [];
        clusterGrid.set(key, cluster);
      }
      cluster.push(label);
    }

    const leaderLabels: PlacedLabel[] = [];
    const callouts: StackedCallout[] = [];

    for (const [_, cluster] of clusterGrid) {
      if (cluster.length < this.options.calloutThreshold) {
        for (const label of cluster) {
          const placed = this.tryPlaceWithLeader(label, viewportWidth, viewportHeight);
          if (placed) {
            leaderLabels.push(placed);
          }
        }
      } else {
        const callout = this.createCallout(cluster, viewportWidth, viewportHeight);
        if (callout) {
          callouts.push(callout);
        }
      }
    }

    return { leaderLabels, callouts, newClusterAssignments };
  }

  private tryPlaceWithLeader(
    label: PlacedLabel,
    viewportWidth: number,
    viewportHeight: number
  ): PlacedLabel | null {
    const { leaderLineMargin, padding, fontSize, lineHeight } = this.options;
    const labelWidth = this.measureText(label.item.text);
    const labelHeight = fontSize * lineHeight;

    const prevPlacement = this.prevPlacements.get(label.item.id);
    const prevOffsetIndex = prevPlacement?.type === 'leader' ? prevPlacement.leaderOffsetIndex : undefined;

    const indicesToTry: number[] = [];
    if (prevOffsetIndex !== undefined && prevOffsetIndex >= 0 && prevOffsetIndex < LEADER_OFFSETS.length) {
      indicesToTry.push(prevOffsetIndex);
    }
    for (let i = 0; i < LEADER_OFFSETS.length; i++) {
      if (i !== prevOffsetIndex) {
        indicesToTry.push(i);
      }
    }

    for (const idx of indicesToTry) {
      const offsetDef = LEADER_OFFSETS[idx]!;

      let offsetX: number;
      if (offsetDef.x < 0) {
        offsetX = offsetDef.x * leaderLineMargin - labelWidth;
      } else {
        offsetX = offsetDef.x * leaderLineMargin;
      }
      const offsetY = offsetDef.y * leaderLineMargin;

      const screenX = label.anchorScreenX + offsetX;
      const screenY = label.anchorScreenY + offsetY - labelHeight / 2;

      if (screenX < 0 || screenX + labelWidth > viewportWidth ||
          screenY < 0 || screenY + labelHeight > viewportHeight) {
        continue;
      }

      const bounds: BoundingBox = {
        x: screenX - padding,
        y: screenY - padding,
        width: labelWidth + padding * 2,
        height: labelHeight + padding * 2,
      };

      if (!this.grid.hasOverlap(bounds)) {
        this.grid.insert(bounds);
        this.newPlacements.set(label.item.id, { type: 'leader', leaderOffsetIndex: idx });
        return {
          ...label,
          screenX,
          screenY,
          bounds,
          needsLeaderLine: true,
        };
      }
    }

    return null;
  }

  private createCallout(
    cluster: PlacedLabel[],
    viewportWidth: number,
    viewportHeight: number
  ): StackedCallout | null {
    const { padding, fontSize, lineHeight, maxCalloutLabels, hysteresisMargin } = this.options;

    const aircraftPositions = cluster.map(label => ({
      x: label.anchorScreenX,
      y: label.anchorScreenY,
    }));

    let centroidX = 0;
    let centroidY = 0;
    for (const pos of aircraftPositions) {
      centroidX += pos.x;
      centroidY += pos.y;
    }
    centroidX /= aircraftPositions.length;
    centroidY /= aircraftPositions.length;

    const aircraftPoints = aircraftPositions.map(p => ({ screenX: p.x, screenY: p.y }));

    const items = cluster.map(l => l.item);
    const displayCount = Math.min(items.length, maxCalloutLabels);
    const hiddenCount = items.length - displayCount;

    const maxTextWidth = Math.max(
      ...items.slice(0, displayCount).map(i => this.measureText(i.text))
    );
    const moreText = hiddenCount > 0 ? `+${hiddenCount} more` : null;
    const moreWidth = moreText ? this.measureText(moreText) : 0;
    const boxWidth = Math.max(maxTextWidth, moreWidth) + padding * 2;
    const boxHeight = (displayCount + (moreText ? 1 : 0)) * fontSize * lineHeight + padding * 2;

    const clusterKey = items.map(i => i.id).sort().join(',');
    const cached = this.prevCalloutPositions.get(clusterKey);

    if (cached) {
      const centroidDelta = Math.hypot(centroidX - cached.centroidX, centroidY - cached.centroidY);

      if (centroidDelta < hysteresisMargin) {
        const boxX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, cached.boxX));
        const boxY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, cached.boxY));

        const bounds: BoundingBox = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

        if (!this.grid.hasOverlap(bounds)) {
          this.grid.insert(bounds);
          return {
            items: items.slice(0, displayCount),
            boxX,
            boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
          };
        }
      }
    }

    const positions = [
      { x: centroidX + 50, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth - 50, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth / 2, y: centroidY - boxHeight - 50 },
      { x: centroidX - boxWidth / 2, y: centroidY + 50 },
      { x: centroidX + 100, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth - 100, y: centroidY - boxHeight / 2 },
    ];

    for (const pos of positions) {
      const boxX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, pos.x));
      const boxY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, pos.y));

      const bounds: BoundingBox = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

      if (!this.grid.hasOverlap(bounds)) {
        this.grid.insert(bounds);
        return {
          items: items.slice(0, displayCount),
          boxX,
          boxY,
          boxWidth,
          boxHeight,
          centroidX,
          centroidY,
          aircraftPoints,
        };
      }
    }

    const fallbackX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, positions[0]!.x));
    const fallbackY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, positions[0]!.y));

    const bounds: BoundingBox = { x: fallbackX, y: fallbackY, width: boxWidth, height: boxHeight };
    this.grid.insert(bounds);

    return {
      items: items.slice(0, displayCount),
      boxX: fallbackX,
      boxY: fallbackY,
      boxWidth,
      boxHeight,
      centroidX,
      centroidY,
      aircraftPoints,
    };
  }
}
