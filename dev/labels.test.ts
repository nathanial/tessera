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
      return placer.place(items, worldToScreen, viewportWidth, viewportHeight, 0, gridOffset);
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
