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
  type LabelItem,
  type PlacedLabel,
  type StackedCallout,
  type PlacementResult,
  type PlacementOptions,
  type TextMeasureFn,
  type CachedCallout,
  type CachedPlacement,
} from "./LabelTypes";

const CANDIDATE_DIRECTIONS = [
  { x: 1, y: 0 },   // right
  { x: 1, y: -1 },  // right-up
  { x: 1, y: 1 },   // right-down
  { x: -1, y: 0 },  // left
  { x: -1, y: -1 }, // left-up
  { x: -1, y: 1 },  // left-down
  { x: 0, y: -1 },  // above
  { x: 0, y: 1 },   // below
];

const CANDIDATE_RINGS = [1, 1.6, 2.2, 3];
const HIDDEN_INDICATOR_ID = "__hidden_indicator__";
const CALLOUT_CACHE_FRAMES = 120;
const CALLOUT_ANCHOR_SMOOTHING = 0.2;
const CALLOUT_ANCHOR_MIN_VISIBLE = 3;

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
  private calloutLastSeen: Map<string, number> = new Map();
  private prevPlacements: Map<string, CachedPlacement> = new Map();
  private newPlacements: Map<string, CachedPlacement> = new Map();
  private frameIndex = 0;

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
    this.calloutLastSeen.clear();
    this.prevPlacements.clear();
    this.newPlacements.clear();
    this.frameIndex = 0;
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
    gridOffset: { x: number; y: number } = { x: 0, y: 0 },
    layoutOptions: { lockLayout?: boolean } = {}
  ): PlacementResult {
    if (layoutOptions.lockLayout) {
      return this.placeLocked(items, worldToScreen, viewportWidth, viewportHeight, labelOffsetX, gridOffset);
    }
    this.frameIndex += 1;
    this.pruneCalloutCache();
    this.grid.clear();
    this.newPlacements.clear();

    const directLabels: PlacedLabel[] = [];
    const displaced: PlacedLabel[] = [];
    let hiddenCount = 0;
    const clusterCellSize = this.getClusterCellSize();
    const origin = worldToScreen(0, 0);
    const gridShift = {
      x: Math.floor(origin.screenX / clusterCellSize),
      y: Math.floor(origin.screenY / clusterCellSize),
    };

    // Sort by priority (higher first)
    const sorted = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // First pass: try direct placement
    for (const item of sorted) {
      const anchor = worldToScreen(item.anchorX, item.anchorY);

      // Skip if anchor is off-screen
      if (anchor.screenX < -100 || anchor.screenX > viewportWidth + 100 ||
          anchor.screenY < -100 || anchor.screenY > viewportHeight + 100) {
        continue;
      }

      const labelWidth = this.measureText(item.text);
      const labelHeight = this.options.fontSize * this.options.lineHeight;
      const prevPlacement = this.prevPlacements.get(item.id);
      const preferCallout = prevPlacement?.type === "callout";
      const cellX = Math.floor((anchor.screenX - gridOffset.x) / clusterCellSize);
      const cellY = Math.floor((anchor.screenY - gridOffset.y) / clusterCellSize);
      const clusterKey = `${cellX - gridShift.x},${cellY - gridShift.y}`;
      const hasCachedCallout = this.prevCalloutPositions.has(clusterKey) || this.calloutLastSeen.has(clusterKey);

      // Try preferred position (right of anchor)
      const preferredX = anchor.screenX + labelOffsetX;
      const preferredY = anchor.screenY - labelHeight / 2;

      const bounds = this.buildBounds(preferredX, preferredY, labelWidth, labelHeight);

      if (!preferCallout && !hasCachedCallout && this.isWithinViewport(bounds, viewportWidth, viewportHeight) && !this.grid.hasOverlap(bounds)) {
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
    }

    // Second pass: cluster displaced labels and create callouts
    const { leaderLabels, callouts, newClusterAssignments, hiddenCount: displacedHidden } = this.resolveDisplaced(
      displaced,
      viewportWidth,
      viewportHeight,
      gridOffset,
      gridShift
    );
    hiddenCount += displacedHidden;

    // Update hysteresis state
    this.prevClusterAssignments = newClusterAssignments;

    this.prevPlacements = this.newPlacements;
    this.newPlacements = new Map();

    let hiddenIndicator: PlacedLabel | undefined;
    if (hiddenCount > 0) {
      hiddenIndicator = this.placeHiddenIndicator(hiddenCount, viewportWidth, viewportHeight);
    }

    return { directLabels, leaderLabels, callouts, hiddenCount, hiddenIndicator };
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

  private placeLocked(
    items: LabelItem[],
    worldToScreen: (x: number, y: number) => { screenX: number; screenY: number },
    viewportWidth: number,
    viewportHeight: number,
    labelOffsetX: number,
    gridOffset: { x: number; y: number }
  ): PlacementResult {
    this.grid.clear();

    const itemById = new Map(items.map(item => [item.id, item]));
    const calloutItemIds = new Set<string>();
    const callouts: StackedCallout[] = [];
    let hiddenCount = 0;

    for (const [clusterKey, cached] of this.prevCalloutPositions) {
      if (!cached.itemIds || cached.itemIds.length === 0) continue;

      const visibleItems = cached.itemIds
        .map(id => itemById.get(id))
        .filter((item): item is LabelItem => item !== undefined);

      if (visibleItems.length === 0) continue;

      for (const item of visibleItems) {
        calloutItemIds.add(item.id);
      }

      let centroidX = 0;
      let centroidY = 0;
      const aircraftPoints: Array<{ screenX: number; screenY: number }> = [];

      for (const item of visibleItems) {
        const anchor = worldToScreen(item.anchorX, item.anchorY);
        centroidX += anchor.screenX;
        centroidY += anchor.screenY;
        aircraftPoints.push({ screenX: anchor.screenX, screenY: anchor.screenY });
      }

      centroidX /= visibleItems.length;
      centroidY /= visibleItems.length;

      const displayCount = Math.min(visibleItems.length, this.options.maxCalloutLabels);
      const hiddenCountLocal = visibleItems.length - displayCount;
      const itemsToShow = visibleItems.slice(0, displayCount);

      const boxWidth = cached.boxWidth;
      const boxHeight = cached.boxHeight;
      let boxX = centroidX + cached.boxOffsetX;
      let boxY = centroidY + cached.boxOffsetY;

      boxX = Math.max(this.options.padding, Math.min(viewportWidth - boxWidth - this.options.padding, boxX));
      boxY = Math.max(this.options.padding, Math.min(viewportHeight - boxHeight - this.options.padding, boxY));

      const bounds = this.buildBounds(boxX, boxY, boxWidth, boxHeight);
      if (this.isWithinViewport(bounds, viewportWidth, viewportHeight) && !this.grid.hasOverlap(bounds)) {
        this.grid.insert(bounds);
        callouts.push({
          items: itemsToShow,
          boxX,
          boxY,
          boxWidth,
          boxHeight,
          centroidX,
          centroidY,
          aircraftPoints,
          hiddenCount: hiddenCountLocal,
        });
      }
    }

    const directLabels: PlacedLabel[] = [];
    const leaderLabels: PlacedLabel[] = [];

    for (const item of items) {
      if (calloutItemIds.has(item.id)) continue;

      const anchor = worldToScreen(item.anchorX, item.anchorY);
      if (anchor.screenX < -100 || anchor.screenX > viewportWidth + 100 ||
          anchor.screenY < -100 || anchor.screenY > viewportHeight + 100) {
        continue;
      }

      const labelWidth = this.measureText(item.text);
      const labelHeight = this.options.fontSize * this.options.lineHeight;
      const prevPlacement = this.prevPlacements.get(item.id);

      if (prevPlacement?.type === "leader" && prevPlacement.candidateIndex !== undefined) {
        const candidates = this.getCandidateOffsets(labelWidth, labelHeight, this.options.leaderLineMargin);
        const candidate = candidates[prevPlacement.candidateIndex];
        if (candidate) {
          const screenX = anchor.screenX + candidate.x;
          const screenY = anchor.screenY + candidate.y;
          const bounds = this.buildBounds(screenX, screenY, labelWidth, labelHeight);
          if (this.isWithinViewport(bounds, viewportWidth, viewportHeight) && !this.grid.hasOverlap(bounds)) {
            this.grid.insert(bounds);
            leaderLabels.push({
              item,
              screenX,
              screenY,
              anchorScreenX: anchor.screenX,
              anchorScreenY: anchor.screenY,
              needsLeaderLine: true,
              bounds,
            });
            continue;
          }
        }
      }

      const preferredX = anchor.screenX + labelOffsetX;
      const preferredY = anchor.screenY - labelHeight / 2;
      const bounds = this.buildBounds(preferredX, preferredY, labelWidth, labelHeight);
      if (this.isWithinViewport(bounds, viewportWidth, viewportHeight) && !this.grid.hasOverlap(bounds)) {
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
      } else {
        hiddenCount += 1;
      }
    }

    let hiddenIndicator: PlacedLabel | undefined;
    if (hiddenCount > 0) {
      hiddenIndicator = this.placeHiddenIndicator(hiddenCount, viewportWidth, viewportHeight);
    }

    return { directLabels, leaderLabels, callouts, hiddenCount, hiddenIndicator };
  }

  private buildBounds(
    screenX: number,
    screenY: number,
    labelWidth: number,
    labelHeight: number
  ): BoundingBox {
    const padding = this.options.padding;
    return {
      x: screenX - padding,
      y: screenY - padding,
      width: labelWidth + padding * 2,
      height: labelHeight + padding * 2,
    };
  }

  private isWithinViewport(
    bounds: BoundingBox,
    viewportWidth: number,
    viewportHeight: number
  ): boolean {
    return (
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= viewportWidth &&
      bounds.y + bounds.height <= viewportHeight
    );
  }

  private orderCandidateIndices(count: number, preferred?: number): number[] {
    const ordered: number[] = [];
    if (preferred !== undefined && preferred >= 0 && preferred < count) {
      ordered.push(preferred);
    }
    for (let i = 0; i < count; i++) {
      if (i !== preferred) ordered.push(i);
    }
    return ordered;
  }

  private getCandidateOffsets(
    labelWidth: number,
    labelHeight: number,
    margin: number
  ): Array<{ x: number; y: number }> {
    const offsets: Array<{ x: number; y: number }> = [];
    for (const ring of CANDIDATE_RINGS) {
      const distance = margin * ring;
      for (const dir of CANDIDATE_DIRECTIONS) {
        let offsetX = dir.x * distance;
        if (dir.x < 0) {
          offsetX -= labelWidth;
        } else if (dir.x === 0) {
          offsetX -= labelWidth / 2;
        }
        const offsetY = dir.y * distance - labelHeight / 2;
        offsets.push({ x: offsetX, y: offsetY });
      }
    }
    return offsets;
  }

  private placeHiddenIndicator(
    hiddenCount: number,
    viewportWidth: number,
    viewportHeight: number
  ): PlacedLabel | undefined {
    const text = `+${hiddenCount} hidden`;
    const labelWidth = this.measureText(text);
    const labelHeight = this.options.fontSize * this.options.lineHeight;
    const margin = this.options.padding;

    const positions = [
      { x: margin, y: margin },
      { x: viewportWidth - labelWidth - margin, y: margin },
      { x: margin, y: viewportHeight - labelHeight - margin },
      { x: viewportWidth - labelWidth - margin, y: viewportHeight - labelHeight - margin },
    ];

    for (const pos of positions) {
      if (pos.x < 0 || pos.y < 0) continue;
      const bounds = this.buildBounds(pos.x, pos.y, labelWidth, labelHeight);
      if (!this.isWithinViewport(bounds, viewportWidth, viewportHeight)) continue;
      if (this.grid.hasOverlap(bounds)) continue;

      this.grid.insert(bounds);
      return {
        item: {
          id: HIDDEN_INDICATOR_ID,
          text,
          anchorX: 0,
          anchorY: 0,
          priority: Number.POSITIVE_INFINITY,
        },
        screenX: pos.x,
        screenY: pos.y,
        anchorScreenX: pos.x,
        anchorScreenY: pos.y,
        needsLeaderLine: false,
        bounds,
      };
    }

    return undefined;
  }

  private resolveDisplaced(
    displaced: PlacedLabel[],
    viewportWidth: number,
    viewportHeight: number,
    gridOffset: { x: number; y: number },
    gridShift: { x: number; y: number }
  ): {
    leaderLabels: PlacedLabel[];
    callouts: StackedCallout[];
    newClusterAssignments: Map<string, string>;
    hiddenCount: number;
  } {
    if (displaced.length === 0) {
      return { leaderLabels: [], callouts: [], newClusterAssignments: new Map(), hiddenCount: 0 };
    }

    const clusterGrid = new Map<string, PlacedLabel[]>();
    const clusterCellSize = this.options.fontSize * 12;
    const newClusterAssignments = new Map<string, string>();

    for (const label of displaced) {
      const cx = Math.floor((label.anchorScreenX - gridOffset.x) / clusterCellSize);
      const cy = Math.floor((label.anchorScreenY - gridOffset.y) / clusterCellSize);
      const currentKey = `${cx - gridShift.x},${cy - gridShift.y}`;

      const prevKey = this.prevClusterAssignments.get(label.item.id);
      let key = currentKey;

      if (prevKey && prevKey !== currentKey) {
        const [prevCxStr, prevCyStr] = prevKey.split(',');
        const prevCx = Number(prevCxStr);
        const prevCy = Number(prevCyStr);
        const prevCenterX = (prevCx + gridShift.x + 0.5) * clusterCellSize + gridOffset.x;
        const prevCenterY = (prevCy + gridShift.y + 0.5) * clusterCellSize + gridOffset.y;

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
    let hiddenCount = 0;

    for (const [clusterKey, cluster] of clusterGrid) {
      const hasPrevCallout = cluster.some(label => this.prevPlacements.get(label.item.id)?.type === "callout");
      const hasCachedCallout = this.prevCalloutPositions.has(clusterKey) || this.calloutLastSeen.has(clusterKey);
      const releaseThreshold = Math.max(2, this.options.calloutReleaseThreshold);
      const shouldUseCallout =
        cluster.length >= this.options.calloutThreshold ||
        (hasPrevCallout && cluster.length >= releaseThreshold) ||
        (hasCachedCallout && cluster.length > 0);

      if (!shouldUseCallout) {
        const unplaced: PlacedLabel[] = [];
        for (const label of cluster) {
          const placed = this.tryPlaceWithLeader(label, viewportWidth, viewportHeight);
          if (placed) {
            leaderLabels.push(placed);
          } else {
            unplaced.push(label);
          }
        }
        if (unplaced.length > 0) {
          const callout = this.createCallout(
            unplaced,
            viewportWidth,
            viewportHeight,
            clusterKey,
            clusterCellSize,
            gridOffset,
            gridShift
          );
          if (callout) {
            callouts.push(callout);
            for (const label of unplaced) {
              this.newPlacements.set(label.item.id, { type: "callout" });
            }
          } else {
            hiddenCount += unplaced.length;
            for (const label of unplaced) {
              this.newPlacements.set(label.item.id, { type: "hidden" });
            }
          }
        }
      }

      if (shouldUseCallout) {
        const callout = this.createCallout(
          cluster,
          viewportWidth,
          viewportHeight,
          clusterKey,
          clusterCellSize,
          gridOffset,
          gridShift
        );
        if (callout) {
          callouts.push(callout);
          for (const label of cluster) {
            this.newPlacements.set(label.item.id, { type: "callout" });
          }
        } else {
          hiddenCount += cluster.length;
          for (const label of cluster) {
            this.newPlacements.set(label.item.id, { type: "hidden" });
          }
        }
      }
    }

    return { leaderLabels, callouts, newClusterAssignments, hiddenCount };
  }

  private tryPlaceWithLeader(
    label: PlacedLabel,
    viewportWidth: number,
    viewportHeight: number
  ): PlacedLabel | null {
    const { leaderLineMargin, fontSize, lineHeight } = this.options;
    const labelWidth = this.measureText(label.item.text);
    const labelHeight = fontSize * lineHeight;

    const prevPlacement = this.prevPlacements.get(label.item.id);
    const prevCandidateIndex = prevPlacement?.type === "leader" ? prevPlacement.candidateIndex : undefined;
    const candidates = this.getCandidateOffsets(labelWidth, labelHeight, leaderLineMargin);
    const indicesToTry = this.orderCandidateIndices(candidates.length, prevCandidateIndex);

    for (const idx of indicesToTry) {
      const offset = candidates[idx]!;
      const screenX = label.anchorScreenX + offset.x;
      const screenY = label.anchorScreenY + offset.y;

      const bounds = this.buildBounds(screenX, screenY, labelWidth, labelHeight);
      if (!this.isWithinViewport(bounds, viewportWidth, viewportHeight)) {
        continue;
      }

      if (!this.grid.hasOverlap(bounds)) {
        this.grid.insert(bounds);
        this.newPlacements.set(label.item.id, { type: "leader", candidateIndex: idx });
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
    viewportHeight: number,
    clusterKey: string,
    clusterCellSize: number,
    gridOffset: { x: number; y: number },
    gridShift: { x: number; y: number }
  ): StackedCallout | null {
    const { padding, fontSize, lineHeight, maxCalloutLabels, leaderLineMargin } = this.options;

    const aircraftPositions = cluster.map(label => ({
      x: label.anchorScreenX,
      y: label.anchorScreenY,
    }));

    let visibleCentroidX = 0;
    let visibleCentroidY = 0;
    for (const pos of aircraftPositions) {
      visibleCentroidX += pos.x;
      visibleCentroidY += pos.y;
    }
    visibleCentroidX /= aircraftPositions.length;
    visibleCentroidY /= aircraftPositions.length;

    const [cellXStr, cellYStr] = clusterKey.split(",");
    const worldCellX = Number(cellXStr);
    const worldCellY = Number(cellYStr);
    const cellX = worldCellX + gridShift.x;
    const cellY = worldCellY + gridShift.y;
    const cellCenterX = (cellX + 0.5) * clusterCellSize + gridOffset.x;
    const cellCenterY = (cellY + 0.5) * clusterCellSize + gridOffset.y;
    const cached = this.prevCalloutPositions.get(clusterKey);

    let centroidX = visibleCentroidX;
    let centroidY = visibleCentroidY;
    if (cached?.centroidOffsetX !== undefined && cached?.centroidOffsetY !== undefined) {
      const cachedCentroidX = cellCenterX + cached.centroidOffsetX;
      const cachedCentroidY = cellCenterY + cached.centroidOffsetY;
      if (cluster.length >= CALLOUT_ANCHOR_MIN_VISIBLE) {
        centroidX = cachedCentroidX + (visibleCentroidX - cachedCentroidX) * CALLOUT_ANCHOR_SMOOTHING;
        centroidY = cachedCentroidY + (visibleCentroidY - cachedCentroidY) * CALLOUT_ANCHOR_SMOOTHING;
      } else {
        centroidX = cachedCentroidX;
        centroidY = cachedCentroidY;
      }
    }

    const items = cluster.map(l => l.item);
    const itemIds = items.map(item => item.id);
    const centroidOffsetX = centroidX - cellCenterX;
    const centroidOffsetY = centroidY - cellCenterY;

    const aircraftPoints = aircraftPositions.map(p => ({ screenX: p.x, screenY: p.y }));
    const displayCount = Math.min(items.length, maxCalloutLabels);
    const hiddenCount = items.length - displayCount;

    if (displayCount === 0) {
      return null;
    }

    const maxTextWidth = Math.max(
      ...items.slice(0, displayCount).map(i => this.measureText(i.text))
    );
    const moreText = hiddenCount > 0 ? `+${hiddenCount} more` : null;
    const moreWidth = moreText ? this.measureText(moreText) : 0;
    const boxWidth = Math.max(maxTextWidth, moreWidth) + padding * 2;
    const boxHeight = (displayCount + (moreText ? 1 : 0)) * fontSize * lineHeight + padding * 2;

    if (boxWidth + padding * 2 > viewportWidth || boxHeight + padding * 2 > viewportHeight) {
      return null;
    }

    const tryPlace = (candidateX: number, candidateY: number): { boxX: number; boxY: number } | null => {
      const boxX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, candidateX));
      const boxY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, candidateY));
      const bounds = this.buildBounds(boxX, boxY, boxWidth, boxHeight);
      if (!this.isWithinViewport(bounds, viewportWidth, viewportHeight)) return null;
      if (this.grid.hasOverlap(bounds)) return null;
      this.grid.insert(bounds);
      return { boxX, boxY };
    };

    if (cached) {
      // Apply cached offset to current centroid (box moves with panning)
      const placement = tryPlace(centroidX + cached.boxOffsetX, centroidY + cached.boxOffsetY);
      if (placement) {
        this.prevCalloutPositions.set(clusterKey, {
          boxOffsetX: placement.boxX - centroidX,
          boxOffsetY: placement.boxY - centroidY,
          boxWidth,
          boxHeight,
          centroidOffsetX,
          centroidOffsetY,
          itemIds,
        });
        this.calloutLastSeen.set(clusterKey, this.frameIndex);
        return {
          items: items.slice(0, displayCount),
          boxX: placement.boxX,
          boxY: placement.boxY,
          boxWidth,
          boxHeight,
          centroidX,
          centroidY,
          aircraftPoints,
          hiddenCount,
        };
      }
    }

    for (const ring of CANDIDATE_RINGS) {
      const distance = leaderLineMargin * ring;
      for (const dir of CANDIDATE_DIRECTIONS) {
        let candidateX = centroidX + dir.x * distance;
        if (dir.x < 0) {
          candidateX -= boxWidth;
        } else if (dir.x === 0) {
          candidateX -= boxWidth / 2;
        }
        const candidateY = centroidY + dir.y * distance - boxHeight / 2;
        const placement = tryPlace(candidateX, candidateY);
        if (placement) {
          this.prevCalloutPositions.set(clusterKey, {
            boxOffsetX: placement.boxX - centroidX,
            boxOffsetY: placement.boxY - centroidY,
            boxWidth,
            boxHeight,
            centroidOffsetX,
            centroidOffsetY,
            itemIds,
          });
          this.calloutLastSeen.set(clusterKey, this.frameIndex);
          return {
            items: items.slice(0, displayCount),
            boxX: placement.boxX,
            boxY: placement.boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
            hiddenCount,
          };
        }
      }
    }

    const step = Math.max(this.options.fontSize * 6, leaderLineMargin);
    const maxRing = Math.ceil(Math.max(viewportWidth, viewportHeight) / step);
    const centerCellX = Math.round(centroidX / step);
    const centerCellY = Math.round(centroidY / step);

    const tryCell = (cellX: number, cellY: number): { boxX: number; boxY: number } | null => {
      const candidateX = cellX * step - boxWidth / 2;
      const candidateY = cellY * step - boxHeight / 2;
      return tryPlace(candidateX, candidateY);
    };

    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const top = tryCell(centerCellX + dx, centerCellY - ring);
        if (top) {
          this.prevCalloutPositions.set(clusterKey, {
            boxOffsetX: top.boxX - centroidX,
            boxOffsetY: top.boxY - centroidY,
            boxWidth,
            boxHeight,
            centroidOffsetX,
            centroidOffsetY,
            itemIds,
          });
          this.calloutLastSeen.set(clusterKey, this.frameIndex);
          return {
            items: items.slice(0, displayCount),
            boxX: top.boxX,
            boxY: top.boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
            hiddenCount,
          };
        }
        if (ring === 0) continue;
        const bottom = tryCell(centerCellX + dx, centerCellY + ring);
        if (bottom) {
          this.prevCalloutPositions.set(clusterKey, {
            boxOffsetX: bottom.boxX - centroidX,
            boxOffsetY: bottom.boxY - centroidY,
            boxWidth,
            boxHeight,
            centroidOffsetX,
            centroidOffsetY,
            itemIds,
          });
          this.calloutLastSeen.set(clusterKey, this.frameIndex);
          return {
            items: items.slice(0, displayCount),
            boxX: bottom.boxX,
            boxY: bottom.boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
            hiddenCount,
          };
        }
      }
      for (let dy = -ring + 1; dy <= ring - 1; dy++) {
        if (ring === 0) break;
        const left = tryCell(centerCellX - ring, centerCellY + dy);
        if (left) {
          this.prevCalloutPositions.set(clusterKey, {
            boxOffsetX: left.boxX - centroidX,
            boxOffsetY: left.boxY - centroidY,
            boxWidth,
            boxHeight,
            centroidOffsetX,
            centroidOffsetY,
            itemIds,
          });
          this.calloutLastSeen.set(clusterKey, this.frameIndex);
          return {
            items: items.slice(0, displayCount),
            boxX: left.boxX,
            boxY: left.boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
            hiddenCount,
          };
        }
        const right = tryCell(centerCellX + ring, centerCellY + dy);
        if (right) {
          this.prevCalloutPositions.set(clusterKey, {
            boxOffsetX: right.boxX - centroidX,
            boxOffsetY: right.boxY - centroidY,
            boxWidth,
            boxHeight,
            centroidOffsetX,
            centroidOffsetY,
            itemIds,
          });
          this.calloutLastSeen.set(clusterKey, this.frameIndex);
          return {
            items: items.slice(0, displayCount),
            boxX: right.boxX,
            boxY: right.boxY,
            boxWidth,
            boxHeight,
            centroidX,
            centroidY,
            aircraftPoints,
            hiddenCount,
          };
        }
      }
    }

    return null;
  }

  private pruneCalloutCache(): void {
    if (this.calloutLastSeen.size === 0) return;
    for (const [key, lastSeen] of this.calloutLastSeen) {
      if (this.frameIndex - lastSeen > CALLOUT_CACHE_FRAMES) {
        this.calloutLastSeen.delete(key);
        this.prevCalloutPositions.delete(key);
      }
    }
  }
}
