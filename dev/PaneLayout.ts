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

export interface TabGroupNode {
  kind: "tabgroup";
  id: string;
  paneIds: string[];
  activeIndex: number;
}

export type LayoutNode = LeafNode | SplitNode | TabGroupNode;

export interface SplitterHandle {
  node: SplitNode;
  rect: PaneRect;
  container: PaneRect;
}

export interface TabGroupInfo {
  node: TabGroupNode;
  rect: PaneRect;
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
  if (node.kind === "tabgroup") return node.paneIds.length;
  return countPanes(node.a) + countPanes(node.b);
}

export function collectPaneIds(node: LayoutNode, out: Set<string>): void {
  if (node.kind === "leaf") {
    out.add(node.id);
    return;
  }
  if (node.kind === "tabgroup") {
    for (const id of node.paneIds) {
      out.add(id);
    }
    return;
  }
  collectPaneIds(node.a, out);
  collectPaneIds(node.b, out);
}

export function removePane(
  node: LayoutNode,
  targetId: string
): { node: LayoutNode | null; removed: boolean } {
  if (node.kind === "leaf") {
    if (node.id === targetId) {
      return { node: null, removed: true };
    }
    return { node, removed: false };
  }

  if (node.kind === "tabgroup") {
    const idx = node.paneIds.indexOf(targetId);
    if (idx === -1) return { node, removed: false };

    const newPaneIds = [...node.paneIds];
    newPaneIds.splice(idx, 1);

    // If only one pane left, convert back to leaf
    if (newPaneIds.length === 1) {
      return { node: { kind: "leaf", id: newPaneIds[0]! }, removed: true };
    }
    // If no panes left, remove entirely
    if (newPaneIds.length === 0) {
      return { node: null, removed: true };
    }

    // Adjust active index if needed
    const newActiveIndex = Math.min(node.activeIndex, newPaneIds.length - 1);
    return {
      node: { ...node, paneIds: newPaneIds, activeIndex: newActiveIndex },
      removed: true,
    };
  }

  const left = removePane(node.a, targetId);
  const right = removePane(node.b, targetId);
  const removed = left.removed || right.removed;

  if (!removed) {
    return { node, removed: false };
  }

  if (!left.node && !right.node) {
    return { node: null, removed: true };
  }
  if (!left.node) {
    return { node: right.node, removed: true };
  }
  if (!right.node) {
    return { node: left.node, removed: true };
  }
  return { node: { ...node, a: left.node, b: right.node }, removed: true };
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

  if (node.kind === "tabgroup") {
    // Check if target is this tab group (by ID) or a pane within it
    if (node.id !== targetId && !node.paneIds.includes(targetId)) return { node, didSplit: false };
    // Split entire tab group
    const split: SplitNode = {
      kind: "split",
      id: makeId("split"),
      orientation,
      ratio: 0.5,
      a: node,
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

/**
 * Split layout with control over new pane position.
 * @param newPaneFirst If true, new pane goes in position a (left/top), target goes in b (right/bottom).
 *                     If false, target stays in a, new pane goes in b (default splitLayout behavior).
 */
export function splitLayoutWithPosition(
  node: LayoutNode,
  targetId: string,
  orientation: Orientation,
  newPaneId: string,
  newPaneFirst: boolean
): LayoutNode {
  const helper = (n: LayoutNode): { node: LayoutNode; didSplit: boolean } => {
    if (n.kind === "leaf") {
      if (n.id !== targetId) return { node: n, didSplit: false };
      const split: SplitNode = {
        kind: "split",
        id: makeId("split"),
        orientation,
        ratio: 0.5,
        a: newPaneFirst ? { kind: "leaf", id: newPaneId } : { kind: "leaf", id: n.id },
        b: newPaneFirst ? { kind: "leaf", id: n.id } : { kind: "leaf", id: newPaneId },
      };
      return { node: split, didSplit: true };
    }

    if (n.kind === "tabgroup") {
      // Check if target is in this tab group
      if (!n.paneIds.includes(targetId)) return { node: n, didSplit: false };
      // Split entire tab group
      const split: SplitNode = {
        kind: "split",
        id: makeId("split"),
        orientation,
        ratio: 0.5,
        a: newPaneFirst ? { kind: "leaf", id: newPaneId } : n,
        b: newPaneFirst ? n : { kind: "leaf", id: newPaneId },
      };
      return { node: split, didSplit: true };
    }

    const left = helper(n.a);
    if (left.didSplit) {
      return { node: { ...n, a: left.node }, didSplit: true };
    }
    const right = helper(n.b);
    if (right.didSplit) {
      return { node: { ...n, b: right.node }, didSplit: true };
    }
    return { node: n, didSplit: false };
  };

  return helper(node).node;
}

export function computePaneRects(
  node: LayoutNode,
  rect: PaneRect,
  out: Map<string, PaneRect>,
  tabHeaderHeight: number = 0
): void {
  if (node.kind === "leaf") {
    // Reserve space for tab header even for single panes
    const contentRect: PaneRect = {
      x: rect.x,
      y: rect.y + tabHeaderHeight,
      width: rect.width,
      height: rect.height - tabHeaderHeight,
    };
    out.set(node.id, contentRect);
    return;
  }
  if (node.kind === "tabgroup") {
    // Reserve space for tab header, only output active pane's rect
    const contentRect: PaneRect = {
      x: rect.x,
      y: rect.y + tabHeaderHeight,
      width: rect.width,
      height: rect.height - tabHeaderHeight,
    };
    const activePaneId = node.paneIds[node.activeIndex];
    if (activePaneId) {
      out.set(activePaneId, contentRect);
    }
    return;
  }
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    computePaneRects(node.a, left, out, tabHeaderHeight);
    computePaneRects(node.b, right, out, tabHeaderHeight);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    computePaneRects(node.a, top, out, tabHeaderHeight);
    computePaneRects(node.b, bottom, out, tabHeaderHeight);
  }
}

export function findPaneAt(
  node: LayoutNode,
  rect: PaneRect,
  x: number,
  y: number,
  tabHeaderHeight: number = 0
): string | null {
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) {
    return null;
  }
  if (node.kind === "leaf") return node.id;
  if (node.kind === "tabgroup") {
    // Return active pane (tab header clicks handled separately)
    return node.paneIds[node.activeIndex] ?? null;
  }
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    return findPaneAt(node.a, left, x, y, tabHeaderHeight) ?? findPaneAt(node.b, right, x, y, tabHeaderHeight);
  }
  const splitY = rect.y + rect.height * node.ratio;
  const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
  const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
  return findPaneAt(node.a, top, x, y, tabHeaderHeight) ?? findPaneAt(node.b, bottom, x, y, tabHeaderHeight);
}

export function collectSplitters(
  node: LayoutNode,
  rect: PaneRect,
  out: SplitterHandle[],
  thickness: number,
  tabHeaderHeight: number = 0
): void {
  if (node.kind === "leaf") return;
  if (node.kind === "tabgroup") return; // Tab groups have no internal splitters
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    out.push({
      node,
      rect: { x: splitX - thickness / 2, y: rect.y, width: thickness, height: rect.height },
      container: rect,
    });
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    collectSplitters(node.a, left, out, thickness, tabHeaderHeight);
    collectSplitters(node.b, right, out, thickness, tabHeaderHeight);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    out.push({
      node,
      rect: { x: rect.x, y: splitY - thickness / 2, width: rect.width, height: thickness },
      container: rect,
    });
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    collectSplitters(node.a, top, out, thickness, tabHeaderHeight);
    collectSplitters(node.b, bottom, out, thickness, tabHeaderHeight);
  }
}

export function clampRatio(value: number, min: number = 0.15, max: number = 0.85): number {
  return Math.min(max, Math.max(min, value));
}

// ==================== Tab Group Functions ====================

/**
 * Convert a leaf node to a tab group with 2 panes.
 */
export function convertToTabGroup(
  node: LayoutNode,
  targetId: string,
  newPaneId: string
): { node: LayoutNode; didConvert: boolean } {
  if (node.kind === "leaf") {
    if (node.id !== targetId) return { node, didConvert: false };
    const tabGroup: TabGroupNode = {
      kind: "tabgroup",
      id: makeId("tabgroup"),
      paneIds: [node.id, newPaneId],
      activeIndex: 1, // Activate new tab
    };
    return { node: tabGroup, didConvert: true };
  }

  if (node.kind === "tabgroup") {
    // Can't convert a tab group to tab group
    return { node, didConvert: false };
  }

  const left = convertToTabGroup(node.a, targetId, newPaneId);
  if (left.didConvert) {
    return { node: { ...node, a: left.node }, didConvert: true };
  }
  const right = convertToTabGroup(node.b, targetId, newPaneId);
  if (right.didConvert) {
    return { node: { ...node, b: right.node }, didConvert: true };
  }
  return { node, didConvert: false };
}

/**
 * Add a pane to an existing tab group.
 */
export function addPaneToTabGroup(
  node: LayoutNode,
  targetGroupId: string,
  newPaneId: string
): { node: LayoutNode; didAdd: boolean } {
  if (node.kind === "leaf") {
    return { node, didAdd: false };
  }

  if (node.kind === "tabgroup") {
    if (node.id !== targetGroupId) return { node, didAdd: false };
    return {
      node: {
        ...node,
        paneIds: [...node.paneIds, newPaneId],
        activeIndex: node.paneIds.length, // Activate new tab
      },
      didAdd: true,
    };
  }

  const left = addPaneToTabGroup(node.a, targetGroupId, newPaneId);
  if (left.didAdd) {
    return { node: { ...node, a: left.node }, didAdd: true };
  }
  const right = addPaneToTabGroup(node.b, targetGroupId, newPaneId);
  if (right.didAdd) {
    return { node: { ...node, b: right.node }, didAdd: true };
  }
  return { node, didAdd: false };
}

/**
 * Set the active tab in a tab group.
 */
export function setActiveTab(
  node: LayoutNode,
  tabGroupId: string,
  paneId: string
): LayoutNode {
  if (node.kind === "leaf") return node;

  if (node.kind === "tabgroup") {
    if (node.id !== tabGroupId) return node;
    const idx = node.paneIds.indexOf(paneId);
    if (idx === -1) return node;
    return { ...node, activeIndex: idx };
  }

  return {
    ...node,
    a: setActiveTab(node.a, tabGroupId, paneId),
    b: setActiveTab(node.b, tabGroupId, paneId),
  };
}

/**
 * Collect all tab groups with their screen rectangles.
 */
export function collectTabGroups(
  node: LayoutNode,
  rect: PaneRect,
  out: TabGroupInfo[]
): void {
  if (node.kind === "leaf") return;

  if (node.kind === "tabgroup") {
    out.push({ node, rect });
    return;
  }

  // SplitNode - recurse
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    collectTabGroups(node.a, left, out);
    collectTabGroups(node.b, right, out);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    collectTabGroups(node.a, top, out);
    collectTabGroups(node.b, bottom, out);
  }
}

/**
 * Find the tab group containing a specific pane.
 */
export function findTabGroupContaining(
  node: LayoutNode,
  paneId: string
): TabGroupNode | null {
  if (node.kind === "leaf") return null;

  if (node.kind === "tabgroup") {
    if (node.paneIds.includes(paneId)) {
      return node;
    }
    return null;
  }

  return (
    findTabGroupContaining(node.a, paneId) ??
    findTabGroupContaining(node.b, paneId)
  );
}

/** Info for rendering a single pane's tab header */
export interface PaneTabInfo {
  paneId: string;
  rect: PaneRect;  // Full rect including header area
  isTabGroup: boolean;
  tabGroupNode: TabGroupNode | null;
}

/**
 * Collect all panes with their full rects (for tab header rendering).
 * This includes both leaf panes and panes in tab groups.
 */
export function collectPaneTabs(
  node: LayoutNode,
  rect: PaneRect,
  out: PaneTabInfo[]
): void {
  if (node.kind === "leaf") {
    out.push({
      paneId: node.id,
      rect,
      isTabGroup: false,
      tabGroupNode: null,
    });
    return;
  }

  if (node.kind === "tabgroup") {
    // For tab groups, add info for rendering the tab bar
    out.push({
      paneId: node.paneIds[node.activeIndex] ?? "",
      rect,
      isTabGroup: true,
      tabGroupNode: node,
    });
    return;
  }

  // SplitNode - recurse
  if (node.orientation === "vertical") {
    const splitX = rect.x + rect.width * node.ratio;
    const left: PaneRect = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height };
    const right: PaneRect = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height };
    collectPaneTabs(node.a, left, out);
    collectPaneTabs(node.b, right, out);
  } else {
    const splitY = rect.y + rect.height * node.ratio;
    const top: PaneRect = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y };
    const bottom: PaneRect = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY };
    collectPaneTabs(node.a, top, out);
    collectPaneTabs(node.b, bottom, out);
  }
}
