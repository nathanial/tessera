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
  targetX: number;      // Screen position of cluster centroid (for leader line)
  targetY: number;
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
};

/** Function to measure text width */
export type TextMeasureFn = (text: string, fontSize: number) => number;

export class LabelPlacer {
  private options: PlacementOptions;
  private grid: SpatialGrid;
  private widthCache: Map<string, number> = new Map();
  private measureFn?: TextMeasureFn;

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
   * Place labels with overlap resolution
   */
  place(
    items: LabelItem[],
    worldToScreen: (x: number, y: number) => { screenX: number; screenY: number },
    viewportWidth: number,
    viewportHeight: number,
    labelOffsetX: number = 10  // Pixels offset from anchor
  ): PlacementResult {
    this.grid.clear();

    const directLabels: PlacedLabel[] = [];
    const displaced: PlacedLabel[] = [];

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

      // Try preferred position (right of anchor)
      const preferredX = anchor.screenX + labelOffsetX;
      const preferredY = anchor.screenY - labelHeight / 2;

      const bounds: BoundingBox = {
        x: preferredX - this.options.padding,
        y: preferredY - this.options.padding,
        width: labelWidth + this.options.padding * 2,
        height: labelHeight + this.options.padding * 2,
      };

      if (!this.grid.hasOverlap(bounds)) {
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
    const { leaderLabels, callouts } = this.resolveDisplaced(
      displaced,
      viewportWidth,
      viewportHeight
    );

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
    viewportHeight: number
  ): { leaderLabels: PlacedLabel[]; callouts: StackedCallout[] } {
    if (displaced.length === 0) {
      return { leaderLabels: [], callouts: [] };
    }

    // Cluster nearby displaced labels using grid-based clustering
    const clusterGrid = new Map<string, PlacedLabel[]>();
    const clusterCellSize = this.options.fontSize * 6; // Larger cells for clustering

    for (const label of displaced) {
      const cx = Math.floor(label.anchorScreenX / clusterCellSize);
      const cy = Math.floor(label.anchorScreenY / clusterCellSize);
      const key = `${cx},${cy}`;

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

    return { leaderLabels, callouts };
  }

  private tryPlaceWithLeader(
    label: PlacedLabel,
    viewportWidth: number,
    viewportHeight: number
  ): PlacedLabel | null {
    const { leaderLineMargin, padding, fontSize, lineHeight } = this.options;
    const labelWidth = this.measureText(label.item.text);
    const labelHeight = fontSize * lineHeight;

    // Try positions in expanding rings around the anchor
    const offsets = [
      // Right positions (preferred)
      { x: leaderLineMargin, y: 0 },
      { x: leaderLineMargin, y: -leaderLineMargin },
      { x: leaderLineMargin, y: leaderLineMargin },
      // Left positions
      { x: -leaderLineMargin - labelWidth, y: 0 },
      { x: -leaderLineMargin - labelWidth, y: -leaderLineMargin },
      { x: -leaderLineMargin - labelWidth, y: leaderLineMargin },
      // Above/below
      { x: 0, y: -leaderLineMargin - labelHeight },
      { x: 0, y: leaderLineMargin },
      // Further out
      { x: leaderLineMargin * 2, y: 0 },
      { x: leaderLineMargin * 2, y: -leaderLineMargin * 2 },
      { x: leaderLineMargin * 2, y: leaderLineMargin * 2 },
    ];

    for (const offset of offsets) {
      const screenX = label.anchorScreenX + offset.x;
      const screenY = label.anchorScreenY + offset.y - labelHeight / 2;

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
    const { padding, fontSize, lineHeight, maxCalloutLabels } = this.options;

    // Calculate cluster centroid
    let centroidX = 0;
    let centroidY = 0;
    for (const label of cluster) {
      centroidX += label.anchorScreenX;
      centroidY += label.anchorScreenY;
    }
    centroidX /= cluster.length;
    centroidY /= cluster.length;

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
          targetX: centroidX,
          targetY: centroidY,
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
      targetX: centroidX,
      targetY: centroidY,
    };
  }
}
