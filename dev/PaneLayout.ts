/**
 * Pane layout tree for multi-viewport rendering.
 */

export type Orientation = "vertical" | "horizontal";

export interface PaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LeafNode {
  kind: "leaf";
  id: string;
}

export interface SplitNode {
  kind: "split";
  id: string;
  orientation: Orientation;
  ratio: number;
  a: LayoutNode;
  b: LayoutNode;
}

export type LayoutNode = LeafNode | SplitNode;

export interface SplitterHandle {
  node: SplitNode;
  rect: PaneRect;
  container: PaneRect;
}

const makeId = (() => {
  let counter = 0;
  return (prefix: string) => `${prefix}-${counter++}`;
})();

export function createLayout(rootId: string): LayoutNode {
  return { kind: "leaf", id: rootId };
}

export function countPanes(node: LayoutNode): number {
  if (node.kind === "leaf") return 1;
  return countPanes(node.a) + countPanes(node.b);
}

export function splitLayout(
  node: LayoutNode,
  targetId: string,
  orientation: Orientation,
  newPaneId: string
): { node: LayoutNode; didSplit: boolean } {
  if (node.kind === "leaf") {
    if (node.id !== targetId) return { node, didSplit: false };
    const split: SplitNode = {
      kind: "split",
      id: makeId("split"),
      orientation,
      ratio: 0.5,
      a: { kind: "leaf", id: node.id },
      b: { kind: "leaf", id: newPaneId },
    };
    return { node: split, didSplit: true };
  }

  const left = splitLayout(node.a, targetId, orientation, newPaneId);
  if (left.didSplit) {
    return { node: { ...node, a: left.node }, didSplit: true };
  }
  const right = splitLayout(node.b, targetId, orientation, newPaneId);
  if (right.didSplit) {
    return { node: { ...node, b: right.node }, didSplit: true };
  }
  return { node, didSplit: false };
}

export function computePaneRects(
  node: LayoutNode,
  rect: PaneRect,
  out: Map<string, PaneRect>
): void {
  if (node.kind === "leaf") {
    out.set(node.id, rect);
    return;
  }
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    computePaneRects(node.a, left, out);
    computePaneRects(node.b, right, out);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    computePaneRects(node.a, top, out);
    computePaneRects(node.b, bottom, out);
  }
}

export function findPaneAt(
  node: LayoutNode,
  rect: PaneRect,
  x: number,
  y: number
): string | null {
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) {
    return null;
  }
  if (node.kind === "leaf") return node.id;
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    return findPaneAt(node.a, left, x, y) ?? findPaneAt(node.b, right, x, y);
  }
  const splitY = rect.y + rect.height * node.ratio;
  const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
  const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
  return findPaneAt(node.a, top, x, y) ?? findPaneAt(node.b, bottom, x, y);
}

export function collectSplitters(
  node: LayoutNode,
  rect: PaneRect,
  out: SplitterHandle[],
  thickness: number
): void {
  if (node.kind === "leaf") return;
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    out.push({
      node,
      rect: { x: splitX - thickness / 2, y: rect.y, width: thickness, height: rect.height },
      container: rect,
    });
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    collectSplitters(node.a, left, out, thickness);
    collectSplitters(node.b, right, out, thickness);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    out.push({
      node,
      rect: { x: rect.x, y: splitY - thickness / 2, width: rect.width, height: thickness },
      container: rect,
    });
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    collectSplitters(node.a, top, out, thickness);
    collectSplitters(node.b, bottom, out, thickness);
  }
}

export function clampRatio(value: number, min: number = 0.15, max: number = 0.85): number {
  return Math.min(max, Math.max(min, value));
}
