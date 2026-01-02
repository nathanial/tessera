/**
 * Label placement system with stacked callouts
 *
 * Handles overlap detection and creates:
 * - Direct labels (no overlap)
 * - Leader lines (for displaced labels)
 * - Stacked callouts (for dense clusters)
 */

// ============================================
// TYPES
// ============================================

export interface LabelItem {
  id: string;
  text: string;
  anchorX: number;  // World X position of anchor (e.g., aircraft)
  anchorY: number;  // World Y position
  priority?: number; // Higher = more important (placed first)
}

export interface BoundingBox {
  x: number;      // Screen X (left edge)
  y: number;      // Screen Y (top edge)
  width: number;
  height: number;
}

export interface PlacedLabel {
  item: LabelItem;
  screenX: number;      // Screen position of label
  screenY: number;
  anchorScreenX: number; // Screen position of anchor
  anchorScreenY: number;
  needsLeaderLine: boolean;
  bounds: BoundingBox;
}

export interface StackedCallout {
  items: LabelItem[];
  boxX: number;         // Screen position of callout box
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  centroidX: number;    // Screen position of cluster centroid (for branching tree)
  centroidY: number;
  aircraftPoints: Array<{ screenX: number; screenY: number }>;  // All aircraft positions for branching lines
}

export interface PlacementResult {
  directLabels: PlacedLabel[];       // Labels placed without leader lines
  leaderLabels: PlacedLabel[];       // Labels with leader lines
  callouts: StackedCallout[];        // Stacked callouts for dense areas
}

export interface PlacementOptions {
  fontSize: number;
  charWidth: number;          // Width per character as fraction of fontSize
  lineHeight: number;         // Line height as fraction of fontSize
  padding: number;            // Padding around labels in pixels
  calloutThreshold: number;   // Number of overlapping labels before using callout
  maxCalloutLabels: number;   // Max labels shown in callout before "+N more"
  leaderLineMargin: number;   // Min distance to displace label
  hysteresisMargin: number;   // Pixels - must move this far past boundary to switch clusters
}

// ============================================
// SPATIAL INDEX (Grid-based)
// ============================================

class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, BoundingBox[]> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  private getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  private getCellsForBox(box: BoundingBox): string[] {
    const keys: string[] = [];
    const x1 = Math.floor(box.x / this.cellSize);
    const y1 = Math.floor(box.y / this.cellSize);
    const x2 = Math.floor((box.x + box.width) / this.cellSize);
    const y2 = Math.floor((box.y + box.height) / this.cellSize);

    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        keys.push(`${cx},${cy}`);
      }
    }
    return keys;
  }

  insert(box: BoundingBox): void {
    for (const key of this.getCellsForBox(box)) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = [];
        this.cells.set(key, cell);
      }
      cell.push(box);
    }
  }

  queryOverlaps(box: BoundingBox): BoundingBox[] {
    const candidates = new Set<BoundingBox>();
    for (const key of this.getCellsForBox(box)) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const b of cell) {
          candidates.add(b);
        }
      }
    }

    const overlaps: BoundingBox[] = [];
    for (const candidate of candidates) {
      if (boxesOverlap(box, candidate)) {
        overlaps.push(candidate);
      }
    }
    return overlaps;
  }

  hasOverlap(box: BoundingBox): boolean {
    for (const key of this.getCellsForBox(box)) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const b of cell) {
          if (boxesOverlap(box, b)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

// ============================================
// LABEL PLACER
// ============================================

const DEFAULT_OPTIONS: PlacementOptions = {
  fontSize: 14,
  charWidth: 0.55,
  lineHeight: 1.2,
  padding: 4,
  calloutThreshold: 4,
  maxCalloutLabels: 5,
  leaderLineMargin: 30,
  hysteresisMargin: 20,
};

/** Function to measure text width */
export type TextMeasureFn = (text: string, fontSize: number) => number;

interface CachedCallout {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  centroidX: number;
  centroidY: number;
}

/** Tracks placement decision for each label for frame-to-frame stability */
interface CachedPlacement {
  type: 'direct' | 'leader' | 'callout';
  leaderOffsetIndex?: number;  // Which offset position was used for leader lines
}

// Standard offsets for leader line placement (indexed for caching)
const LEADER_OFFSETS = [
  // Right positions (preferred)
  { x: 1, y: 0 },       // 0: right
  { x: 1, y: -1 },      // 1: right-up
  { x: 1, y: 1 },       // 2: right-down
  // Left positions
  { x: -1, y: 0 },      // 3: left
  { x: -1, y: -1 },     // 4: left-up
  { x: -1, y: 1 },      // 5: left-down
  // Above/below
  { x: 0, y: -1 },      // 6: above
  { x: 0, y: 1 },       // 7: below
  // Further out
  { x: 2, y: 0 },       // 8: far right
  { x: 2, y: -2 },      // 9: far right-up
  { x: 2, y: 2 },       // 10: far right-down
];

export class LabelPlacer {
  private options: PlacementOptions;
  private grid: SpatialGrid;
  private widthCache: Map<string, number> = new Map();
  private measureFn?: TextMeasureFn;

  // Hysteresis state for stable clustering
  private prevClusterAssignments: Map<string, string> = new Map();  // labelId → clusterKey
  private prevCalloutPositions: Map<string, CachedCallout> = new Map();  // clusterKey → cached callout
  private prevPlacements: Map<string, CachedPlacement> = new Map();  // labelId → placement type
  private newPlacements: Map<string, CachedPlacement> = new Map();  // current frame placements

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
    labelOffsetX: number = 10,  // Pixels offset from anchor
    gridOffset: { x: number; y: number } = { x: 0, y: 0 }  // Grid offset for stable clustering
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

      // Hysteresis: prefer staying in previous placement type
      // If was direct and now overlaps, still try direct (be sticky)
      // Only displace if overlap is significant
      if (!hasOverlap || (wasDirect && hasOverlap)) {
        // Check if we should force direct placement (hysteresis)
        if (!hasOverlap) {
          // No overlap - place directly
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
          // Was direct, now overlaps - mark for displacement
          // (We tried to stay direct but can't)
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
        // Mark for displacement
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

    // Update hysteresis state for next frame
    this.prevClusterAssignments = newClusterAssignments;

    // Update callout position cache for next frame
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

    // Update placement type cache for next frame
    this.prevPlacements = this.newPlacements;
    this.newPlacements = new Map();

    return { directLabels, leaderLabels, callouts };
  }

  /**
   * Measure text width with caching.
   * Uses actual measurement if measureFn is set, otherwise estimates.
   */
  private measureText(text: string): number {
    const fontSize = this.options.fontSize;

    // Try cache first
    const key = `${text}:${fontSize}`;
    const cached = this.widthCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Measure or estimate
    let width: number;
    if (this.measureFn) {
      width = this.measureFn(text, fontSize);
    } else {
      // Fallback to estimation
      width = text.length * fontSize * this.options.charWidth;
    }

    // Cache and return
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

    // Cluster labels using SCREEN-SPACE coordinates (zoom-dependent clustering)
    // Apply gridOffset to anchor cells to world coordinates for stability
    const clusterGrid = new Map<string, PlacedLabel[]>();
    const clusterCellSize = this.options.fontSize * 12; // Screen pixels
    const newClusterAssignments = new Map<string, string>();

    for (const label of displaced) {
      // Calculate current cell in screen space, offset to align with world grid
      const cx = Math.floor((label.anchorScreenX - gridOffset.x) / clusterCellSize);
      const cy = Math.floor((label.anchorScreenY - gridOffset.y) / clusterCellSize);
      const currentKey = `${cx},${cy}`;

      // Check previous assignment for hysteresis (stability during panning)
      const prevKey = this.prevClusterAssignments.get(label.item.id);
      let key = currentKey;

      if (prevKey && prevKey !== currentKey) {
        // Label crossed a boundary - check if it's far enough to switch
        const [prevCxStr, prevCyStr] = prevKey.split(',');
        const prevCx = Number(prevCxStr);
        const prevCy = Number(prevCyStr);
        const prevCenterX = (prevCx + 0.5) * clusterCellSize + gridOffset.x;
        const prevCenterY = (prevCy + 0.5) * clusterCellSize + gridOffset.y;

        const distToPrevCenter = Math.hypot(
          label.anchorScreenX - prevCenterX,
          label.anchorScreenY - prevCenterY
        );

        // Only switch if moved past hysteresis margin from previous cell center
        if (distToPrevCenter < clusterCellSize / 2 + this.options.hysteresisMargin) {
          key = prevKey;  // Stay in previous cluster
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
        // Small cluster: try individual leader lines
        for (const label of cluster) {
          const placed = this.tryPlaceWithLeader(label, viewportWidth, viewportHeight);
          if (placed) {
            leaderLabels.push(placed);
          }
        }
      } else {
        // Large cluster: create stacked callout
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

    // Check for cached offset from previous frame
    const prevPlacement = this.prevPlacements.get(label.item.id);
    const prevOffsetIndex = prevPlacement?.type === 'leader' ? prevPlacement.leaderOffsetIndex : undefined;

    // Build order of indices to try - prefer previous position first
    const indicesToTry: number[] = [];
    if (prevOffsetIndex !== undefined && prevOffsetIndex >= 0 && prevOffsetIndex < LEADER_OFFSETS.length) {
      indicesToTry.push(prevOffsetIndex);
    }
    for (let i = 0; i < LEADER_OFFSETS.length; i++) {
      if (i !== prevOffsetIndex) {
        indicesToTry.push(i);
      }
    }

    // Try each position
    for (const idx of indicesToTry) {
      const offsetDef = LEADER_OFFSETS[idx]!;

      // Convert normalized offset to pixels
      let offsetX: number;
      if (offsetDef.x < 0) {
        offsetX = offsetDef.x * leaderLineMargin - labelWidth;
      } else {
        offsetX = offsetDef.x * leaderLineMargin;
      }
      const offsetY = offsetDef.y * leaderLineMargin;

      const screenX = label.anchorScreenX + offsetX;
      const screenY = label.anchorScreenY + offsetY - labelHeight / 2;

      // Check viewport bounds
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
        // Track which offset was used
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

    // Could not place - label will be hidden or in callout
    return null;
  }

  private createCallout(
    cluster: PlacedLabel[],
    viewportWidth: number,
    viewportHeight: number
  ): StackedCallout | null {
    const { padding, fontSize, lineHeight, maxCalloutLabels, hysteresisMargin } = this.options;

    // Collect all aircraft screen positions
    const aircraftPositions = cluster.map(label => ({
      x: label.anchorScreenX,
      y: label.anchorScreenY,
    }));

    // Calculate cluster centroid
    let centroidX = 0;
    let centroidY = 0;
    for (const pos of aircraftPositions) {
      centroidX += pos.x;
      centroidY += pos.y;
    }
    centroidX /= aircraftPositions.length;
    centroidY /= aircraftPositions.length;

    // Store all aircraft points for branching lines
    const aircraftPoints = aircraftPositions.map(p => ({ screenX: p.x, screenY: p.y }));

    // Determine labels to show
    const items = cluster.map(l => l.item);
    const displayCount = Math.min(items.length, maxCalloutLabels);
    const hiddenCount = items.length - displayCount;

    // Calculate callout box dimensions
    const maxTextWidth = Math.max(
      ...items.slice(0, displayCount).map(i => this.measureText(i.text))
    );
    const moreText = hiddenCount > 0 ? `+${hiddenCount} more` : null;
    const moreWidth = moreText ? this.measureText(moreText) : 0;
    const boxWidth = Math.max(maxTextWidth, moreWidth) + padding * 2;
    const boxHeight = (displayCount + (moreText ? 1 : 0)) * fontSize * lineHeight + padding * 2;

    // Check for cached position (hysteresis)
    const clusterKey = items.map(i => i.id).sort().join(',');
    const cached = this.prevCalloutPositions.get(clusterKey);

    if (cached) {
      // Check if centroid moved significantly
      const centroidDelta = Math.hypot(centroidX - cached.centroidX, centroidY - cached.centroidY);

      if (centroidDelta < hysteresisMargin) {
        // Try to use cached position (may need to adjust if box size changed)
        const boxX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, cached.boxX));
        const boxY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, cached.boxY));

        const bounds: BoundingBox = {
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
        };

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
        // Cached position overlaps now, fall through to find new position
      }
    }

    // Try to place callout near centroid
    const positions = [
      { x: centroidX + 50, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth - 50, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth / 2, y: centroidY - boxHeight - 50 },
      { x: centroidX - boxWidth / 2, y: centroidY + 50 },
      // Further positions
      { x: centroidX + 100, y: centroidY - boxHeight / 2 },
      { x: centroidX - boxWidth - 100, y: centroidY - boxHeight / 2 },
    ];

    for (const pos of positions) {
      // Clamp to viewport
      const boxX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, pos.x));
      const boxY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, pos.y));

      const bounds: BoundingBox = {
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
      };

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

    // Fallback: place anyway at first position
    const fallbackX = Math.max(padding, Math.min(viewportWidth - boxWidth - padding, positions[0]!.x));
    const fallbackY = Math.max(padding, Math.min(viewportHeight - boxHeight - padding, positions[0]!.y));

    const bounds: BoundingBox = {
      x: fallbackX,
      y: fallbackY,
      width: boxWidth,
      height: boxHeight,
    };
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
