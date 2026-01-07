/**
 * Tab Area Widget
 *
 * Tabbed container for the immediate mode UI system.
 * Renders tab headers and content area for the active tab.
 */

import type { UIContext, Rect } from "../UIContext";
import { hoverRect } from "./interaction";

/** Tab definition */
export interface Tab {
  id: string;
  label: string;
}

/** Tab area configuration */
export interface TabAreaConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tabs: Tab[];
  activeTabId?: string; // Controlled mode (optional)
  headerHeight?: number; // Override theme header height
  fontSize?: number; // Override theme font size
  renderContent: (tabId: string, contentRect: Rect, ui: UIContext) => void;
}

/** Tab area result */
export interface TabAreaResult {
  activeTabId: string;
  contentRect: Rect;
}

/** Internal tab area state */
interface TabAreaState {
  activeTabId: string;
}

/**
 * Render a tabbed area.
 */
export function tabArea(ui: UIContext, config: TabAreaConfig): TabAreaResult {
  const { id, x, y, width, height, tabs, activeTabId: controlledActiveTabId, renderContent } = config;
  const theme = ui.getTheme().tabArea;
  const state = ui.getState();
  const input = ui.getInput();

  // Get persistent state
  const defaultTabId = tabs.length > 0 ? tabs[0]!.id : "";
  const tabState = state.getState<TabAreaState>(id, { activeTabId: defaultTabId });

  // Use controlled value if provided, otherwise use internal state
  const activeTabId = controlledActiveTabId ?? tabState.activeTabId;

  // Layout calculations (allow config overrides for scaling)
  const headerHeight = config.headerHeight ?? theme.headerHeight;
  const fontSize = config.fontSize ?? theme.fontSize;
  const contentRect: Rect = {
    x,
    y: y + headerHeight,
    width,
    height: height - headerHeight,
  };

  // Calculate tab widths (equal width for all tabs)
  const tabCount = tabs.length;
  const tabWidth = tabCount > 0 ? width / tabCount : 0;

  // Render tab headers
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]!;
    const tabX = x + i * tabWidth;
    const tabRect = { x: tabX, y, width: tabWidth, height: headerHeight };
    const isActive = tab.id === activeTabId;
    const { isHovered } = hoverRect(ui, tabRect);

    if (isHovered && input.isMouseDown()) {
      tabState.activeTabId = tab.id;
      input.consumeInput();
    }

    // Determine background color
    let bgColor = isActive ? theme.activeBackground : theme.inactiveBackground;
    if (isHovered && !isActive) {
      bgColor = theme.hoverBackground;
    }

    // Render tab background
    ui.fillRect(tabX, y, tabWidth, headerHeight, bgColor);

    // Render tab border (right edge, except last tab)
    if (i < tabs.length - 1) {
      ui.fillRect(tabX + tabWidth - 1, y, 1, headerHeight, theme.borderColor);
    }

    // Render bottom border for inactive tabs
    if (!isActive) {
      ui.fillRect(tabX, y + headerHeight - 1, tabWidth, 1, theme.borderColor);
    }

    // Render tab label
    const textColor = isActive ? theme.activeTextColor : theme.inactiveTextColor;
    const textX = tabX + tabWidth / 2;
    const textY = y + headerHeight / 2 + fontSize * 0.1;
    ui.label(tab.label, textX, textY, {
      color: textColor,
      fontSize: fontSize,
      align: "center",
    });
  }

  // Render content area border (sides and bottom)
  ui.strokeRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height, theme.borderColor, 1);

  // Render content for active tab
  if (activeTabId) {
    renderContent(activeTabId, contentRect, ui);
  }

  // Save state
  state.setState(id, tabState);

  return {
    activeTabId,
    contentRect,
  };
}
