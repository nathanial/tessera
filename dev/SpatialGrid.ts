/**
 * Grid-based spatial index for fast bounding box overlap queries.
 */

export interface BoundingBox {
  x: number;      // Screen X (left edge)
  y: number;      // Screen Y (top edge)
  width: number;
  height: number;
}

/**
 * Check if two bounding boxes overlap.
 */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Spatial grid for efficient overlap detection.
 * Uses a simple grid-based approach with configurable cell size.
 */
export class SpatialGrid {
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
