/**
 * Unit tests for PaneLayout tree operations.
 */

import { describe, it, expect } from "vitest";
import {
  createLayout,
  countPanes,
  collectPaneIds,
  splitLayout,
  splitLayoutWithPosition,
  removePane,
  convertToTabGroup,
  addPaneToTabGroup,
  setActiveTab,
  findTabGroupContaining,
  computePaneRects,
  collectPaneTabs,
  type LayoutNode,
  type TabGroupNode,
  type PaneRect,
  type PaneTabInfo,
} from "./PaneLayout";

describe("PaneLayout", () => {
  describe("createLayout", () => {
    it("creates a leaf node", () => {
      const layout = createLayout("pane-1");
      expect(layout.kind).toBe("leaf");
      expect(layout.id).toBe("pane-1");
    });
  });

  describe("countPanes", () => {
    it("counts single leaf", () => {
      const layout = createLayout("pane-1");
      expect(countPanes(layout)).toBe(1);
    });

    it("counts panes in split", () => {
      const layout = createLayout("pane-1");
      const { node } = splitLayout(layout, "pane-1", "vertical", "pane-2");
      expect(countPanes(node)).toBe(2);
    });

    it("counts panes in tab group", () => {
      const layout = createLayout("pane-1");
      const { node } = convertToTabGroup(layout, "pane-1", "pane-2");
      expect(countPanes(node)).toBe(2);
    });
  });

  describe("splitLayout", () => {
    it("splits a leaf node vertically", () => {
      const layout = createLayout("pane-1");
      const { node, didSplit } = splitLayout(layout, "pane-1", "vertical", "pane-2");

      expect(didSplit).toBe(true);
      expect(node.kind).toBe("split");
      if (node.kind === "split") {
        expect(node.orientation).toBe("vertical");
        expect(node.ratio).toBe(0.5);
        expect(node.a).toEqual({ kind: "leaf", id: "pane-1" });
        expect(node.b).toEqual({ kind: "leaf", id: "pane-2" });
      }
    });

    it("splits a leaf node horizontally", () => {
      const layout = createLayout("pane-1");
      const { node, didSplit } = splitLayout(layout, "pane-1", "horizontal", "pane-2");

      expect(didSplit).toBe(true);
      expect(node.kind).toBe("split");
      if (node.kind === "split") {
        expect(node.orientation).toBe("horizontal");
      }
    });

    it("returns unchanged if target not found", () => {
      const layout = createLayout("pane-1");
      const { node, didSplit } = splitLayout(layout, "nonexistent", "vertical", "pane-2");

      expect(didSplit).toBe(false);
      expect(node).toBe(layout);
    });
  });

  describe("splitLayoutWithPosition", () => {
    it("puts new pane on the left when newPaneFirst is true", () => {
      const layout = createLayout("pane-1");
      const node = splitLayoutWithPosition(layout, "pane-1", "vertical", "pane-2", true);

      expect(node.kind).toBe("split");
      if (node.kind === "split") {
        expect(node.a).toEqual({ kind: "leaf", id: "pane-2" }); // New pane on left
        expect(node.b).toEqual({ kind: "leaf", id: "pane-1" }); // Original on right
      }
    });

    it("puts new pane on the right when newPaneFirst is false", () => {
      const layout = createLayout("pane-1");
      const node = splitLayoutWithPosition(layout, "pane-1", "vertical", "pane-2", false);

      expect(node.kind).toBe("split");
      if (node.kind === "split") {
        expect(node.a).toEqual({ kind: "leaf", id: "pane-1" }); // Original on left
        expect(node.b).toEqual({ kind: "leaf", id: "pane-2" }); // New pane on right
      }
    });

    it("puts new pane on top when newPaneFirst is true (horizontal)", () => {
      const layout = createLayout("pane-1");
      const node = splitLayoutWithPosition(layout, "pane-1", "horizontal", "pane-2", true);

      expect(node.kind).toBe("split");
      if (node.kind === "split") {
        expect(node.orientation).toBe("horizontal");
        expect(node.a).toEqual({ kind: "leaf", id: "pane-2" }); // New pane on top
        expect(node.b).toEqual({ kind: "leaf", id: "pane-1" }); // Original on bottom
      }
    });
  });

  describe("removePane", () => {
    it("removes a leaf and returns null", () => {
      const layout = createLayout("pane-1");
      const { node, removed } = removePane(layout, "pane-1");

      expect(removed).toBe(true);
      expect(node).toBe(null);
    });

    it("collapses split when one child removed", () => {
      const layout = createLayout("pane-1");
      const { node: split } = splitLayout(layout, "pane-1", "vertical", "pane-2");
      const { node, removed } = removePane(split, "pane-2");

      expect(removed).toBe(true);
      expect(node?.kind).toBe("leaf");
      expect((node as any)?.id).toBe("pane-1");
    });

    it("removes pane from tab group", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const { node: withThree } = addPaneToTabGroup(tabGroup, (tabGroup as TabGroupNode).id, "pane-3");
      const { node, removed } = removePane(withThree, "pane-2");

      expect(removed).toBe(true);
      expect(node?.kind).toBe("tabgroup");
      if (node?.kind === "tabgroup") {
        expect(node.paneIds).toEqual(["pane-1", "pane-3"]);
      }
    });

    it("converts tab group to leaf when only one pane left", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const { node, removed } = removePane(tabGroup, "pane-2");

      expect(removed).toBe(true);
      expect(node?.kind).toBe("leaf");
      expect((node as any)?.id).toBe("pane-1");
    });
  });

  describe("convertToTabGroup", () => {
    it("converts leaf to tab group with two panes", () => {
      const layout = createLayout("pane-1");
      const { node, didConvert } = convertToTabGroup(layout, "pane-1", "pane-2");

      expect(didConvert).toBe(true);
      expect(node.kind).toBe("tabgroup");
      if (node.kind === "tabgroup") {
        expect(node.paneIds).toEqual(["pane-1", "pane-2"]);
        expect(node.activeIndex).toBe(1); // New tab is active
      }
    });

    it("does not convert if target not found", () => {
      const layout = createLayout("pane-1");
      const { node, didConvert } = convertToTabGroup(layout, "nonexistent", "pane-2");

      expect(didConvert).toBe(false);
      expect(node).toBe(layout);
    });
  });

  describe("addPaneToTabGroup", () => {
    it("adds pane to existing tab group", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const tabGroupId = (tabGroup as TabGroupNode).id;
      const { node, didAdd } = addPaneToTabGroup(tabGroup, tabGroupId, "pane-3");

      expect(didAdd).toBe(true);
      expect(node.kind).toBe("tabgroup");
      if (node.kind === "tabgroup") {
        expect(node.paneIds).toEqual(["pane-1", "pane-2", "pane-3"]);
        expect(node.activeIndex).toBe(2); // New tab is active
      }
    });
  });

  describe("setActiveTab", () => {
    it("changes active tab index", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const tabGroupId = (tabGroup as TabGroupNode).id;

      expect((tabGroup as TabGroupNode).activeIndex).toBe(1); // pane-2 is active

      const node = setActiveTab(tabGroup, tabGroupId, "pane-1");
      expect(node.kind).toBe("tabgroup");
      if (node.kind === "tabgroup") {
        expect(node.activeIndex).toBe(0); // pane-1 is now active
      }
    });
  });

  describe("findTabGroupContaining", () => {
    it("finds tab group containing a pane", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");

      const found = findTabGroupContaining(tabGroup, "pane-2");
      expect(found).not.toBe(null);
      expect(found?.kind).toBe("tabgroup");
    });

    it("returns null for leaf node", () => {
      const layout = createLayout("pane-1");
      const found = findTabGroupContaining(layout, "pane-1");
      expect(found).toBe(null);
    });
  });

  describe("collectPaneTabs", () => {
    it("collects single leaf pane", () => {
      const layout = createLayout("pane-1");
      const rect: PaneRect = { x: 0, y: 0, width: 800, height: 600 };
      const tabs: PaneTabInfo[] = [];
      collectPaneTabs(layout, rect, tabs);

      expect(tabs.length).toBe(1);
      expect(tabs[0]?.paneId).toBe("pane-1");
      expect(tabs[0]?.isTabGroup).toBe(false);
    });

    it("collects tab group with active pane id", () => {
      const layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const rect: PaneRect = { x: 0, y: 0, width: 800, height: 600 };
      const tabs: PaneTabInfo[] = [];
      collectPaneTabs(tabGroup, rect, tabs);

      expect(tabs.length).toBe(1);
      expect(tabs[0]?.paneId).toBe("pane-2"); // Active pane
      expect(tabs[0]?.isTabGroup).toBe(true);
      expect(tabs[0]?.tabGroupNode?.paneIds).toEqual(["pane-1", "pane-2"]);
    });

    it("collects multiple panes from split", () => {
      const layout = createLayout("pane-1");
      const { node } = splitLayout(layout, "pane-1", "vertical", "pane-2");
      const rect: PaneRect = { x: 0, y: 0, width: 800, height: 600 };
      const tabs: PaneTabInfo[] = [];
      collectPaneTabs(node, rect, tabs);

      expect(tabs.length).toBe(2);
      const paneIds = tabs.map(t => t.paneId).sort();
      expect(paneIds).toEqual(["pane-1", "pane-2"]);
    });
  });

  describe("computePaneRects", () => {
    it("computes rect for single pane with tab header", () => {
      const layout = createLayout("pane-1");
      const rect: PaneRect = { x: 0, y: 0, width: 800, height: 600 };
      const rects = new Map<string, PaneRect>();
      const tabHeight = 28;
      computePaneRects(layout, rect, rects, tabHeight);

      const paneRect = rects.get("pane-1");
      expect(paneRect).toBeDefined();
      expect(paneRect?.x).toBe(0);
      expect(paneRect?.y).toBe(tabHeight);
      expect(paneRect?.width).toBe(800);
      expect(paneRect?.height).toBe(600 - tabHeight);
    });

    it("computes rects for vertical split", () => {
      const layout = createLayout("pane-1");
      const { node } = splitLayout(layout, "pane-1", "vertical", "pane-2");
      const rect: PaneRect = { x: 0, y: 0, width: 800, height: 600 };
      const rects = new Map<string, PaneRect>();
      const tabHeight = 28;
      computePaneRects(node, rect, rects, tabHeight);

      const leftRect = rects.get("pane-1");
      const rightRect = rects.get("pane-2");
      expect(leftRect).toBeDefined();
      expect(rightRect).toBeDefined();
      expect(leftRect?.width).toBe(400);
      expect(rightRect?.width).toBe(400);
      expect(rightRect?.x).toBe(400);
    });
  });

  describe("drag tab from split to stack", () => {
    it("drags leaf pane from split to stack on another leaf", () => {
      // Start with split [A | B]
      let layout = createLayout("pane-1");
      const { node: split } = splitLayout(layout, "pane-1", "vertical", "pane-2");
      layout = split;

      expect(layout.kind).toBe("split");
      expect(countPanes(layout)).toBe(2);

      // Simulate: drag pane-1 to center of pane-2 (stack them)
      // 1. Remove pane-1
      const removeResult = removePane(layout, "pane-1");
      expect(removeResult.removed).toBe(true);
      expect(removeResult.node?.kind).toBe("leaf");
      expect((removeResult.node as any)?.id).toBe("pane-2");
      layout = removeResult.node!;

      // 2. Convert pane-2 to tab group with pane-1
      const convertResult = convertToTabGroup(layout, "pane-2", "pane-1");
      expect(convertResult.didConvert).toBe(true);
      layout = convertResult.node;

      // Verify: tab group [pane-2, pane-1]
      expect(layout.kind).toBe("tabgroup");
      if (layout.kind === "tabgroup") {
        expect(layout.paneIds).toEqual(["pane-2", "pane-1"]);
      }

      // Both panes exist
      const paneIds = new Set<string>();
      collectPaneIds(layout, paneIds);
      expect(paneIds.has("pane-1")).toBe(true);
      expect(paneIds.has("pane-2")).toBe(true);
    });

    it("drags pane from tab group to stack on leaf in another split", () => {
      // Start with split [tabgroup[A,B] | C]
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const { node: split } = splitLayout(tabGroup, (tabGroup as TabGroupNode).id, "vertical", "pane-3");
      layout = split;

      expect(layout.kind).toBe("split");
      expect(countPanes(layout)).toBe(3);

      // Simulate: drag pane-2 from tabgroup to center of pane-3
      // 1. Remove pane-2 from tab group
      const removeResult = removePane(layout, "pane-2");
      expect(removeResult.removed).toBe(true);
      layout = removeResult.node!;

      // Tab group should become leaf pane-1
      expect(layout.kind).toBe("split");
      if (layout.kind === "split") {
        expect(layout.a.kind).toBe("leaf");
      }

      // 2. Convert pane-3 to tab group with pane-2
      const convertResult = convertToTabGroup(layout, "pane-3", "pane-2");
      expect(convertResult.didConvert).toBe(true);
      layout = convertResult.node;

      // Verify final structure: [pane-1 | tabgroup[pane-3, pane-2]]
      expect(layout.kind).toBe("split");
      if (layout.kind === "split") {
        expect(layout.a).toEqual({ kind: "leaf", id: "pane-1" });
        expect(layout.b.kind).toBe("tabgroup");
        if (layout.b.kind === "tabgroup") {
          expect(layout.b.paneIds).toEqual(["pane-3", "pane-2"]);
        }
      }
    });
  });

  describe("pull tab from tab group to create split", () => {
    it("simulates dragging tab from tab group to edge", () => {
      // Start with a tab group of 2 panes
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      layout = tabGroup;

      expect(countPanes(layout)).toBe(2);
      expect(layout.kind).toBe("tabgroup");

      // Simulate: drag pane-2 to left edge
      // 1. Find the remaining pane after removal
      const draggedPaneId = "pane-2";
      const tabGroupNode = layout as TabGroupNode;
      const remainingPaneId = tabGroupNode.paneIds.find(id => id !== draggedPaneId);
      expect(remainingPaneId).toBe("pane-1");

      // 2. Remove dragged pane from group
      const removeResult = removePane(layout, draggedPaneId);
      expect(removeResult.removed).toBe(true);
      expect(removeResult.node?.kind).toBe("leaf"); // Converts to leaf when 1 pane left
      layout = removeResult.node!;

      // 3. Split using remaining pane as target
      layout = splitLayoutWithPosition(layout, remainingPaneId!, "vertical", draggedPaneId, true);

      // Verify result: split with pane-2 on left, pane-1 on right
      expect(layout.kind).toBe("split");
      if (layout.kind === "split") {
        expect(layout.orientation).toBe("vertical");
        expect(layout.a).toEqual({ kind: "leaf", id: "pane-2" });
        expect(layout.b).toEqual({ kind: "leaf", id: "pane-1" });
      }

      // Both panes should still exist
      const paneIds = new Set<string>();
      collectPaneIds(layout, paneIds);
      expect(paneIds.has("pane-1")).toBe(true);
      expect(paneIds.has("pane-2")).toBe(true);
    });

    it("handles dragging from 3-tab group", () => {
      // Start with a tab group of 3 panes
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const { node: tabGroup3 } = addPaneToTabGroup(tabGroup, (tabGroup as TabGroupNode).id, "pane-3");
      layout = tabGroup3;

      expect(countPanes(layout)).toBe(3);

      // Simulate: drag pane-2 to left edge
      const draggedPaneId = "pane-2";
      const tabGroupNode = layout as TabGroupNode;
      const remainingPaneId = tabGroupNode.paneIds.find(id => id !== draggedPaneId);
      expect(remainingPaneId).toBe("pane-1"); // First remaining pane

      // 1. Remove dragged pane from group
      const removeResult = removePane(layout, draggedPaneId);
      expect(removeResult.removed).toBe(true);
      expect(removeResult.node?.kind).toBe("tabgroup"); // Still a tab group with 2 panes
      layout = removeResult.node!;

      // 2. Split using remaining pane as target (which is in the tab group)
      layout = splitLayoutWithPosition(layout, remainingPaneId!, "vertical", draggedPaneId, true);

      // Verify: split with pane-2 on left, [pane-1, pane-3] tab group on right
      expect(layout.kind).toBe("split");
      if (layout.kind === "split") {
        expect(layout.a).toEqual({ kind: "leaf", id: "pane-2" });
        expect(layout.b.kind).toBe("tabgroup");
        if (layout.b.kind === "tabgroup") {
          expect(layout.b.paneIds).toEqual(["pane-1", "pane-3"]);
        }
      }
    });
  });

  describe("BUG: drag active pane from tab group to edge", () => {
    /**
     * This tests the scenario where:
     * - tabgroup[A, B] with B as active
     * - User drags B to left edge
     * - detectDropZone returns targetPaneId: "B" (because B is active)
     * - After removing B, we try to split on "B" which no longer exists!
     *
     * The fix: when targetPaneId === draggedPaneId, use the remaining pane as target
     */
    it("handles dragging active pane to edge of own tab group", () => {
      // Start with tab group [A, B] where B is active
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      layout = tabGroup;

      // Verify pane-2 is active
      expect(layout.kind).toBe("tabgroup");
      const tg = layout as TabGroupNode;
      expect(tg.activeIndex).toBe(1);
      expect(tg.paneIds[tg.activeIndex]).toBe("pane-2");

      // Simulate drag B to left edge
      // detectDropZone would return: { type: "left", targetPaneId: "pane-2" }
      // because pane-2 is the active pane!
      const draggedPaneId = "pane-2";
      const targetPaneId = "pane-2"; // This is the bug - same as dragged!

      // Step 1: Remove dragged pane
      const removeResult = removePane(layout, draggedPaneId);
      expect(removeResult.removed).toBe(true);
      layout = removeResult.node!;

      // Layout is now just leaf pane-1
      expect(layout.kind).toBe("leaf");
      expect((layout as any).id).toBe("pane-1");

      // Step 2: Try to split with target "pane-2" - THIS WILL FAIL
      // because pane-2 doesn't exist in the layout anymore
      const badSplit = splitLayoutWithPosition(layout, targetPaneId, "vertical", draggedPaneId, true);
      // The split fails silently - pane-2 not found, so nothing changes
      expect(badSplit.kind).toBe("leaf"); // Still just pane-1!

      // THE FIX: detect when targetPaneId was removed and use remaining pane
      // Since targetPaneId === draggedPaneId, we need to find what's left
      const fixedTargetId = "pane-1"; // The remaining pane after removal
      const goodSplit = splitLayoutWithPosition(layout, fixedTargetId, "vertical", draggedPaneId, true);

      expect(goodSplit.kind).toBe("split");
      if (goodSplit.kind === "split") {
        expect(goodSplit.a).toEqual({ kind: "leaf", id: "pane-2" }); // dragged on left
        expect(goodSplit.b).toEqual({ kind: "leaf", id: "pane-1" }); // original on right
      }
    });

    it("handles dragging active pane from 3-tab group to edge", () => {
      // Start with tab group [A, B, C] where C is active
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      const { node: tabGroup3 } = addPaneToTabGroup(tabGroup, (tabGroup as TabGroupNode).id, "pane-3");
      layout = tabGroup3;

      // Verify pane-3 is active
      const tg = layout as TabGroupNode;
      expect(tg.activeIndex).toBe(2);
      expect(tg.paneIds[tg.activeIndex]).toBe("pane-3");

      // Drag pane-3 (active) to left edge
      const draggedPaneId = "pane-3";
      const targetPaneId = "pane-3"; // Bug: same as dragged

      // Step 1: Remove dragged pane
      const removeResult = removePane(layout, draggedPaneId);
      layout = removeResult.node!;

      // Still a tab group with [pane-1, pane-2]
      expect(layout.kind).toBe("tabgroup");
      if (layout.kind === "tabgroup") {
        expect(layout.paneIds).toEqual(["pane-1", "pane-2"]);
      }

      // Step 2: targetPaneId "pane-3" no longer exists in the layout!
      // Need to find a remaining pane to use as target
      const remainingPaneIds = (layout as TabGroupNode).paneIds;
      expect(remainingPaneIds.includes(targetPaneId)).toBe(false); // pane-3 not there

      // Use first remaining pane as target
      const fixedTargetId = remainingPaneIds[0];
      const goodSplit = splitLayoutWithPosition(layout, fixedTargetId!, "vertical", draggedPaneId, true);

      expect(goodSplit.kind).toBe("split");
      if (goodSplit.kind === "split") {
        expect(goodSplit.a).toEqual({ kind: "leaf", id: "pane-3" }); // dragged on left
        expect(goodSplit.b.kind).toBe("tabgroup"); // remaining group on right
      }
    });

    it("handles dragging to center when target is in same tab group", () => {
      // tabgroup[A, B] active=B, drag A to center (should do nothing meaningful)
      let layout = createLayout("pane-1");
      const { node: tabGroup } = convertToTabGroup(layout, "pane-1", "pane-2");
      layout = tabGroup;

      const draggedPaneId = "pane-1";
      const targetPaneId = "pane-2"; // B is active, so this is correct

      // Remove A
      const removeResult = removePane(layout, draggedPaneId);
      layout = removeResult.node!;

      // Now it's just leaf pane-2
      expect(layout.kind).toBe("leaf");

      // Try to add A back to a "tab group" containing pane-2
      // But pane-2 is now a leaf, not a tab group
      const targetGroup = findTabGroupContaining(layout, targetPaneId);
      expect(targetGroup).toBe(null); // No tab group anymore!

      // So we need to convertToTabGroup
      const { node: result, didConvert } = convertToTabGroup(layout, targetPaneId, draggedPaneId);
      expect(didConvert).toBe(true);
      expect(result.kind).toBe("tabgroup");
      if (result.kind === "tabgroup") {
        expect(result.paneIds).toEqual(["pane-2", "pane-1"]);
      }
    });
  });
});
