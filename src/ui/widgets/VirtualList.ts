/**
 * Virtual List Widget
 *
 * Virtualized scrollable list that only renders visible items.
 * Supports large lists (1000+ items) efficiently.
 */

import type { UIContext, Rect } from "../UIContext";
import { scrollbar } from "./Scrollbar";

/** List item rectangle passed to renderItem */
export interface ItemRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Virtual list configuration */
export interface VirtualListConfig<T> {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  items: T[];
  itemHeight?: number;
  selectedIndex?: number;
  /** External highlight index (e.g., from map hover) - shows hover background */
  highlightedIndex?: number;
  renderItem: (item: T, index: number, rect: ItemRect, ui: UIContext) => void;
  onSelect?: (index: number, item: T) => void;
}

/** Info about a visible item for connector lines */
export interface VisibleItemInfo<T> {
  index: number;
  item: T;
  screenY: number; // Center Y of the item row in screen pixels
}

/** Virtual list result */
export interface VirtualListResult<T = unknown> {
  scrollOffset: number;
  visibleRange: { start: number; end: number };
  visibleItems: VisibleItemInfo<T>[]; // Positions of rendered items
  hoveredIndex: number | null;
  clickedIndex: number | null;
}

/** Internal list state */
interface VirtualListState {
  scrollOffset: number;
}

/**
 * Render a virtualized list.
 * Only visible items are rendered for performance.
 */
export function virtualList<T>(
  ui: UIContext,
  config: VirtualListConfig<T>
): VirtualListResult<T> {
  const { id, x, y, width, height, items, selectedIndex, highlightedIndex, renderItem, onSelect } = config;
  const theme = ui.getTheme();
  const listTheme = theme.list;
  const scrollbarWidth = theme.scrollbar.width;
  const input = ui.getInput();
  const state = ui.getState();

  const itemHeight = config.itemHeight ?? listTheme.itemHeight;
  const itemCount = items.length;
  const contentHeight = itemCount * itemHeight;
  const needsScrollbar = contentHeight > height;
  const contentWidth = needsScrollbar ? width - scrollbarWidth : width;

  // Get persistent scroll state
  const listState = state.getState<VirtualListState>(id, { scrollOffset: 0 });

  // Handle mouse wheel scrolling
  const mouse = input.getMousePosition();
  const isInList = ui.pointInRect(mouse.x, mouse.y, { x, y, width, height });

  if (isInList) {
    ui.setHovered();

    const wheelDelta = input.getWheelDelta();
    if (wheelDelta !== 0) {
      const scrollAmount = itemHeight * 3 * Math.sign(wheelDelta);
      listState.scrollOffset = clampScroll(
        listState.scrollOffset + scrollAmount,
        contentHeight,
        height
      );
      input.consumeInput();
    }
  }

  // Calculate visible range
  const { startIndex, endIndex, startY } = computeVisibleRange(
    listState.scrollOffset,
    height,
    itemHeight,
    itemCount
  );

  // Draw panel background
  ui.fillRect(x, y, width, height, theme.panel.background);

  // Draw border
  if (theme.panel.borderWidth > 0) {
    ui.strokeRect(x, y, width, height, theme.panel.borderColor, theme.panel.borderWidth);
  }

  // Set up clipping for content
  ui.pushClipRect(x, y, contentWidth, height);

  // Track hover and click
  let hoveredIndex: number | null = null;
  let clickedIndex: number | null = null;
  const visibleItems: VisibleItemInfo<T>[] = [];

  // Render visible items
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    if (!item) continue;

    const rowY = y + startY + (i - startIndex) * itemHeight;

    // Skip if completely above visible area
    if (rowY + itemHeight <= y) continue;

    const itemRect: ItemRect = {
      x: x,
      y: rowY,
      width: contentWidth,
      height: itemHeight,
    };

    // Track this visible item for connector lines
    visibleItems.push({
      index: i,
      item,
      screenY: rowY + itemHeight / 2, // Center Y
    });

    // Check hover
    const isHovered = ui.pointInRect(mouse.x, mouse.y, itemRect);
    const isSelected = i === selectedIndex;

    if (isHovered) {
      hoveredIndex = i;

      // Check click
      if (input.isMouseDown()) {
        clickedIndex = i;
        onSelect?.(i, item);
        input.consumeInput();
      }
    }

    // Draw row background
    const isHighlighted = i === highlightedIndex;
    let bgColor = i % 2 === 0 ? listTheme.itemBackground : listTheme.itemAltBackground;
    if (isSelected) {
      bgColor = listTheme.itemSelectedBackground;
    } else if (isHovered || isHighlighted) {
      bgColor = listTheme.itemHoverBackground;
    }

    ui.fillRect(itemRect.x, itemRect.y, itemRect.width, itemRect.height, bgColor);

    // Draw divider
    if (i < endIndex - 1 && listTheme.dividerWidth > 0) {
      ui.fillRect(
        itemRect.x + listTheme.itemPadding,
        itemRect.y + itemRect.height - listTheme.dividerWidth,
        itemRect.width - listTheme.itemPadding * 2,
        listTheme.dividerWidth,
        listTheme.dividerColor
      );
    }

    // Call custom item renderer
    renderItem(item, i, itemRect, ui);
  }

  // Remove clipping
  ui.popClipRect();

  // Render scrollbar if needed
  if (needsScrollbar) {
    const scrollResult = scrollbar(ui, {
      id: `${id}:scrollbar`,
      x: x + width - scrollbarWidth,
      y: y,
      width: scrollbarWidth,
      height: height,
      contentHeight: contentHeight,
      scrollOffset: listState.scrollOffset,
    });

    listState.scrollOffset = scrollResult.scrollOffset;
  }

  // Save state
  state.setState(id, listState);

  return {
    scrollOffset: listState.scrollOffset,
    visibleRange: { start: startIndex, end: endIndex },
    visibleItems,
    hoveredIndex,
    clickedIndex,
  };
}

/** Clamp scroll offset to valid range */
function clampScroll(offset: number, contentHeight: number, visibleHeight: number): number {
  const maxScroll = Math.max(0, contentHeight - visibleHeight);
  return Math.max(0, Math.min(maxScroll, offset));
}

/** Calculate visible item range */
function computeVisibleRange(
  scrollOffset: number,
  visibleHeight: number,
  itemHeight: number,
  itemCount: number
): { startIndex: number; endIndex: number; startY: number } {
  const startIndex = Math.max(0, Math.floor(scrollOffset / itemHeight));
  const startY = -(scrollOffset % itemHeight);
  const visibleCount = Math.ceil(visibleHeight / itemHeight) + 1;
  const endIndex = Math.min(itemCount, startIndex + visibleCount);

  return { startIndex, endIndex, startY };
}
