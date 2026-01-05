/**
 * Scrollbar Widget
 *
 * Vertical scrollbar with draggable thumb and track click support.
 */

import type { UIContext } from "../UIContext";
import type { Color } from "../UITheme";

/** Scrollbar configuration */
export interface ScrollbarConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentHeight: number;
  scrollOffset: number;
}

/** Scrollbar render result */
export interface ScrollbarResult {
  scrollOffset: number;
  isDragging: boolean;
}

/** Internal drag state */
interface ScrollbarDragState {
  startY: number;
  startOffset: number;
}

/**
 * Render a vertical scrollbar.
 * Returns the new scroll offset.
 */
export function scrollbar(ui: UIContext, config: ScrollbarConfig): ScrollbarResult {
  const { id, x, y, width, height, contentHeight, scrollOffset } = config;
  const theme = ui.getTheme().scrollbar;
  const input = ui.getInput();
  const state = ui.getState();

  // Calculate scroll metrics
  const visibleHeight = height;
  const maxScroll = Math.max(0, contentHeight - visibleHeight);
  const clampedOffset = Math.max(0, Math.min(maxScroll, scrollOffset));

  // Calculate thumb size and position
  const thumbRatio = Math.min(1, visibleHeight / contentHeight);
  const thumbHeight = Math.max(theme.minThumbSize, height * thumbRatio);
  const scrollableTrackHeight = height - thumbHeight;

  const scrollRatio = maxScroll > 0 ? clampedOffset / maxScroll : 0;
  const thumbY = y + scrollRatio * scrollableTrackHeight;

  // Get mouse position
  const mouse = input.getMousePosition();
  const isInTrack =
    mouse.x >= x && mouse.x <= x + width && mouse.y >= y && mouse.y <= y + height;
  const isOnThumb =
    isInTrack && mouse.y >= thumbY && mouse.y <= thumbY + thumbHeight;

  // Handle hover
  if (isInTrack) {
    ui.setHovered();
  }

  // Get drag state
  const dragState = state.getState<ScrollbarDragState | null>(`${id}:drag`, null);
  const isDragging = state.isActive(id);

  let newOffset = clampedOffset;

  // Handle interaction
  if (isDragging && dragState) {
    // Continue dragging
    const deltaY = mouse.y - dragState.startY;
    const scrollDelta =
      scrollableTrackHeight > 0
        ? (deltaY / scrollableTrackHeight) * maxScroll
        : 0;
    newOffset = Math.max(0, Math.min(maxScroll, dragState.startOffset + scrollDelta));

    if (input.isMouseUp()) {
      state.clearActive();
      state.deleteState(`${id}:drag`);
    }
  } else if (isOnThumb) {
    state.setHot(id);

    if (input.isMouseDown()) {
      // Start drag
      state.setActive(id);
      state.setState<ScrollbarDragState>(`${id}:drag`, {
        startY: mouse.y,
        startOffset: clampedOffset,
      });
      input.consumeInput();
    }
  } else if (isInTrack && input.isMouseDown()) {
    // Click on track - page up/down
    if (mouse.y < thumbY) {
      // Page up
      newOffset = Math.max(0, clampedOffset - visibleHeight);
    } else {
      // Page down
      newOffset = Math.min(maxScroll, clampedOffset + visibleHeight);
    }
    input.consumeInput();
  }

  // Determine thumb color
  let thumbColor: Color;
  if (isDragging) {
    thumbColor = theme.thumbActiveColor;
  } else if (state.isHot(id)) {
    thumbColor = theme.thumbHoverColor;
  } else {
    thumbColor = theme.thumbColor;
  }

  // Render track
  ui.fillRect(x, y, width, height, theme.trackColor);

  // Render thumb
  const thumbPadding = 2;
  ui.fillRect(
    x + thumbPadding,
    thumbY,
    width - thumbPadding * 2,
    thumbHeight,
    thumbColor
  );

  return {
    scrollOffset: newOffset,
    isDragging,
  };
}
