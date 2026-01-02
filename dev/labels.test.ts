import { describe, it, expect } from "vitest";
import { LabelPlacer } from "./labels";
import { boxesOverlap, type BoundingBox } from "./SpatialGrid";

const worldToScreen = (x: number, y: number) => ({ screenX: x, screenY: y });

function collectBounds(
  placement: ReturnType<LabelPlacer["place"]>,
  padding: number
): BoundingBox[] {
  const bounds: BoundingBox[] = [];
  for (const label of placement.directLabels) bounds.push(label.bounds);
  for (const label of placement.leaderLabels) bounds.push(label.bounds);
  for (const callout of placement.callouts) {
    bounds.push({
      x: callout.boxX - padding,
      y: callout.boxY - padding,
      width: callout.boxWidth + padding * 2,
      height: callout.boxHeight + padding * 2,
    });
  }
  if (placement.hiddenIndicator) bounds.push(placement.hiddenIndicator.bounds);
  return bounds;
}

describe("LabelPlacer", () => {
  it("places without overlaps across labels and callouts", () => {
    const placer = new LabelPlacer({
      fontSize: 12,
      charWidth: 0.5,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 3,
      maxCalloutLabels: 4,
      leaderLineMargin: 24,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.5);

    const items = [] as Array<{ id: string; text: string; anchorX: number; anchorY: number; priority?: number }>;

    for (let i = 0; i < 10; i++) {
      items.push({
        id: `dense-a-${i}`,
        text: `A${i}`,
        anchorX: 100 + (i % 3) * 4,
        anchorY: 100 + Math.floor(i / 3) * 4,
        priority: 2,
      });
    }

    for (let i = 0; i < 6; i++) {
      items.push({
        id: `dense-b-${i}`,
        text: `B${i}`,
        anchorX: 350 + (i % 2) * 3,
        anchorY: 220 + Math.floor(i / 2) * 3,
        priority: 1,
      });
    }

    for (let i = 0; i < 6; i++) {
      items.push({
        id: `sparse-${i}`,
        text: `S${i}`,
        anchorX: 500 + i * 40,
        anchorY: 80 + (i % 2) * 30,
        priority: 0,
      });
    }

    const placement = placer.place(items, worldToScreen, 800, 600, 12);
    const bounds = collectBounds(placement, 2);

    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        expect(boxesOverlap(bounds[i]!, bounds[j]!)).toBe(false);
      }
    }
  });

  it("keeps callout groupings and offsets stable across panning", () => {
    const placer = new LabelPlacer({
      fontSize: 12,
      charWidth: 0.5,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 1,
      calloutReleaseThreshold: 1,
      maxCalloutLabels: 4,
      leaderLineMargin: 24,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.5);

    const makeCluster = (prefix: string, cx: number, cy: number) =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `${prefix}-${i}`,
        text: `${prefix}_LABEL_${i}`,
        anchorX: cx + (i % 2) * 2,
        anchorY: cy + Math.floor(i / 2) * 2,
      }));

    const items = [
      ...makeCluster("A", 120, 140),
      ...makeCluster("B", 170, 140),
    ];

    const cellSize = placer.getClusterCellSize();
    const viewportWidth = 600;
    const viewportHeight = 400;

    const placeAt = (panX: number, panY: number) => {
      const gridOffset = {
        x: ((panX % cellSize) + cellSize) % cellSize,
        y: ((panY % cellSize) + cellSize) % cellSize,
      };
      const worldToScreen = (x: number, y: number) => ({
        screenX: x + panX,
        screenY: y + panY,
      });
      return placer.place(items, worldToScreen, viewportWidth, viewportHeight, viewportWidth, gridOffset);
    };

    const placementA = placeAt(0, 0);
    const placementB = placeAt(cellSize + 5, 0);

    const offsets = (placement: ReturnType<LabelPlacer["place"]>) => {
      const map = new Map<string, { dx: number; dy: number }>();
      for (const callout of placement.callouts) {
        const key = callout.items.map(item => item.id).sort().join(",");
        map.set(key, {
          dx: callout.boxX - callout.centroidX,
          dy: callout.boxY - callout.centroidY,
        });
      }
      return map;
    };

    const offsetsA = offsets(placementA);
    const offsetsB = offsets(placementB);

    expect(offsetsA.size).toBeGreaterThan(0);
    expect(offsetsB.size).toBe(offsetsA.size);

    for (const [key, offsetA] of offsetsA) {
      const offsetB = offsetsB.get(key);
      expect(offsetB).toBeDefined();
      expect(Math.abs(offsetA.dx - offsetB!.dx)).toBeLessThan(1);
      expect(Math.abs(offsetA.dy - offsetB!.dy)).toBeLessThan(1);
    }
  });

  it("handles many callouts with mixed labels in a large scene", () => {
    const placer = new LabelPlacer({
      fontSize: 12,
      charWidth: 0.5,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 2,
      calloutReleaseThreshold: 2,
      maxCalloutLabels: 12,
      leaderLineMargin: 20,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.5);

    const clustersX = 10;
    const clustersY = 10;
    const labelsPerCluster = 6;
    const cellSize = placer.getClusterCellSize();
    const clusterSpacing = Math.ceil(cellSize * 1.05);
    const clusterOrigin = { x: 200, y: 160 };

    const items: Array<{ id: string; text: string; anchorX: number; anchorY: number }> = [];
    for (let cy = 0; cy < clustersY; cy++) {
      for (let cx = 0; cx < clustersX; cx++) {
        const baseX = clusterOrigin.x + cx * clusterSpacing;
        const baseY = clusterOrigin.y + cy * clusterSpacing;
        for (let i = 0; i < labelsPerCluster; i++) {
          const jitterX = (i % 5) * 2;
          const jitterY = Math.floor(i / 5) * 2;
          items.push({
            id: `cluster-${cx}-${cy}-${i}`,
            text: `CALLSIGN_${cx}_${cy}_${i}_LONG`,
            anchorX: baseX + jitterX,
            anchorY: baseY + jitterY,
          });
        }
      }
    }

    const sparseCount = 240;
    for (let i = 0; i < sparseCount; i++) {
      items.push({
        id: `sparse-${i}`,
        text: `S_${i}`,
        anchorX: 80 + (i % 30) * 60,
        anchorY: 60 + Math.floor(i / 30) * 50,
      });
    }

    const viewportWidth = clusterOrigin.x + (clustersX - 1) * clusterSpacing + 400;
    const viewportHeight = clusterOrigin.y + (clustersY - 1) * clusterSpacing + 400;

    const gridOffset = { x: 0, y: 0 };
    const worldToScreen = (x: number, y: number) => ({ screenX: x, screenY: y });
    const placement = placer.place(items, worldToScreen, viewportWidth, viewportHeight, 0, gridOffset);

    expect(placement.callouts.length).toBeGreaterThanOrEqual(90);
    expect(placement.directLabels.length + placement.leaderLabels.length).toBeGreaterThanOrEqual(200);
  });

  it("keeps callout offsets stable when viewport culls labels during pan", () => {
    const placer = new LabelPlacer({
      fontSize: 12,
      charWidth: 0.5,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 2,
      calloutReleaseThreshold: 2,
      maxCalloutLabels: 8,
      leaderLineMargin: 20,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.5);

    const cellSize = placer.getClusterCellSize();
    const clustersX = 12;
    const clustersY = 8;
    const clusterSpacing = Math.ceil(cellSize * 0.95);
    const clusterOrigin = { x: 200, y: 160 };

    const items: Array<{ id: string; text: string; anchorX: number; anchorY: number }> = [];
    for (let cy = 0; cy < clustersY; cy++) {
      for (let cx = 0; cx < clustersX; cx++) {
        const baseX = clusterOrigin.x + cx * clusterSpacing;
        const baseY = clusterOrigin.y + cy * clusterSpacing;
        for (let i = 0; i < 6; i++) {
          const jitterX = (i % 3) * 2;
          const jitterY = Math.floor(i / 3) * 2;
          items.push({
            id: `cull-${cx}-${cy}-${i}`,
            text: `CULL_${cx}_${cy}_${i}`,
            anchorX: baseX + jitterX,
            anchorY: baseY + jitterY,
          });
        }
      }
    }

    const sparseCount = 240;
    for (let i = 0; i < sparseCount; i++) {
      items.push({
        id: `cull-sparse-${i}`,
        text: `SPARSE_${i}`,
        anchorX: 200 + (i % 20) * 20,
        anchorY: 120 + Math.floor(i / 20) * 20,
      });
    }

    const viewportWidth = 800;
    const viewportHeight = 500;

    const snapshot = (
      placement: ReturnType<LabelPlacer["place"]>,
      gridOffset: { x: number; y: number }
    ) => {
      const map = new Map<string, { dx: number; dy: number }>();
      for (const callout of placement.callouts) {
        const key = `${Math.floor((callout.centroidX - gridOffset.x) / cellSize)},${Math.floor((callout.centroidY - gridOffset.y) / cellSize)}`;
        map.set(key, {
          dx: callout.boxX - callout.centroidX,
          dy: callout.boxY - callout.centroidY,
        });
      }
      return map;
    };

    const placeAt = (panX: number, panY: number) => {
      const gridOffset = {
        x: ((panX % cellSize) + cellSize) % cellSize,
        y: ((panY % cellSize) + cellSize) % cellSize,
      };
      const worldToScreen = (x: number, y: number) => ({
        screenX: x + panX,
        screenY: y + panY,
      });
      const visible = items.filter(item => {
        const screen = worldToScreen(item.anchorX, item.anchorY);
        return (
          screen.screenX >= 0 &&
          screen.screenX <= viewportWidth &&
          screen.screenY >= 0 &&
          screen.screenY <= viewportHeight
        );
      });
      return {
        placement: placer.place(visible, worldToScreen, viewportWidth, viewportHeight, 0, gridOffset),
        gridOffset,
      };
    };

    const pans = [
      { x: 0, y: 0 },
      { x: 40, y: 20 },
      { x: 80, y: 40 },
      { x: 120, y: 60 },
    ];

    let previous = placeAt(pans[0]!.x, pans[0]!.y);
    let previousSnapshot = snapshot(previous.placement, previous.gridOffset);

    expect(previous.placement.callouts.length).toBeGreaterThanOrEqual(15);
    expect(previous.placement.directLabels.length + previous.placement.leaderLabels.length).toBeGreaterThanOrEqual(50);

    for (let i = 1; i < pans.length; i++) {
      const current = placeAt(pans[i]!.x, pans[i]!.y);
      const currentSnapshot = snapshot(current.placement, current.gridOffset);

      let overlapCount = 0;
      const maxDx = viewportWidth;
      const maxDy = viewportHeight;
      for (const [key, prevOffset] of previousSnapshot) {
        const nextOffset = currentSnapshot.get(key);
        if (!nextOffset) continue;
        overlapCount++;
        expect(Math.abs(prevOffset.dx - nextOffset.dx)).toBeLessThan(maxDx);
        expect(Math.abs(prevOffset.dy - nextOffset.dy)).toBeLessThan(maxDy);
      }

      expect(overlapCount).toBeGreaterThan(10);
      previous = current;
      previousSnapshot = currentSnapshot;
    }
  });

  it("marks hidden labels and provides an indicator when space is insufficient", () => {
    const placer = new LabelPlacer({
      fontSize: 14,
      charWidth: 0.6,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 4,
      maxCalloutLabels: 3,
      leaderLineMargin: 20,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.6);

    const items = [
      { id: "only", text: "THIS_LABEL_IS_TOO_WIDE", anchorX: 30, anchorY: 20, priority: 1 },
    ];

    const placement = placer.place(items, worldToScreen, 80, 40, 10);

    expect(placement.hiddenCount).toBe(1);
    expect(placement.hiddenIndicator).toBeDefined();
  });

  it("reports hidden counts inside callouts without contributing to global hiddenCount", () => {
    const placer = new LabelPlacer({
      fontSize: 12,
      charWidth: 0.5,
      lineHeight: 1.2,
      padding: 2,
      calloutThreshold: 2,
      maxCalloutLabels: 2,
      leaderLineMargin: 24,
      hysteresisMargin: 10,
    });
    placer.setMeasureFunction((text, fontSize) => text.length * fontSize * 0.5);

    const items = [] as Array<{ id: string; text: string; anchorX: number; anchorY: number }>;
    for (let i = 0; i < 5; i++) {
      items.push({
        id: `callout-${i}`,
        text: `C${i}`,
        anchorX: 120 + (i % 2) * 2,
        anchorY: 120 + Math.floor(i / 2) * 2,
      });
    }

    const placement = placer.place(items, worldToScreen, 400, 300, 500);

    expect(placement.hiddenCount).toBe(0);
    expect(placement.callouts.length).toBeGreaterThan(0);
    expect(placement.callouts[0]!.items.length).toBe(2);
    expect(placement.callouts[0]!.hiddenCount).toBe(3);
  });
});
