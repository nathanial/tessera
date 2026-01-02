import { describe, it, expect } from "vitest";
import {
  normalizeRect,
  selectIdsInRect,
  projectSelectionItems,
  wrapWorldXNear,
} from "./SelectionUtils";

describe("SelectionUtils", () => {
  it("normalizes rectangle bounds", () => {
    const rect = normalizeRect(10, 30, -5, 15);
    expect(rect).toEqual({ minX: -5, minY: 15, maxX: 10, maxY: 30 });
  });

  it("selects ids within screen rectangle", () => {
    const rect = normalizeRect(10, 10, 30, 30);
    const items = [
      { id: "a", screenX: 12, screenY: 12 },
      { id: "b", screenX: 29, screenY: 25 },
      { id: "c", screenX: 40, screenY: 20 },
    ];
    const selected = selectIdsInRect(items, rect);
    expect(Array.from(selected).sort()).toEqual(["a", "b"]);
  });

  it("projects world items to screen with wrapping", () => {
    // Matrix that maps world [0..1] to screen [0..100]
    const matrix = new Float32Array([2, 0, 0, 0, -2, 0, -1, 1, 1]);
    const bounds = { left: 0, right: 1, top: 0, bottom: 1 };
    const items = [
      { id: "a", x: 0.25, y: 0.75 },
      { id: "wrap", x: 1.2, y: 0.5 },
    ];

    const projected = projectSelectionItems(items, matrix, 100, 100, bounds, 0);
    const byId = new Map(projected.map(item => [item.id, item]));

    expect(byId.get("a")?.screenX).toBeCloseTo(25);
    expect(byId.get("a")?.screenY).toBeCloseTo(75);
    expect(byId.get("wrap")?.screenX).toBeCloseTo(20);
    expect(byId.get("wrap")?.screenY).toBeCloseTo(50);
  });

  it("wraps destination x near a reference", () => {
    expect(wrapWorldXNear(0.1, 0.9)).toBeCloseTo(1.1);
    expect(wrapWorldXNear(0.9, 0.1)).toBeCloseTo(-0.1);
  });
});
