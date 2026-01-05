/**
 * Button Widget
 *
 * Clickable button for the immediate mode UI system.
 */

import type { UIContext } from "../UIContext";

/** Button configuration */
export interface ButtonConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  disabled?: boolean;
}

/** Button result */
export interface ButtonResult {
  clicked: boolean;
  isHovered: boolean;
  isPressed: boolean;
}

/**
 * Render a clickable button.
 */
export function button(ui: UIContext, config: ButtonConfig): ButtonResult {
  const { id, x, y, width, height, label, disabled = false } = config;
  const theme = ui.getTheme().button;
  const input = ui.getInput();
  const state = ui.getState();

  // Get mouse position and check bounds
  const mouse = input.getMousePosition();
  const isInBounds = ui.pointInRect(mouse.x, mouse.y, { x, y, width, height });

  // Track interaction states
  let isHovered = false;
  let isPressed = false;
  let clicked = false;

  if (!disabled) {
    // Handle hover
    if (isInBounds) {
      ui.setHovered();
      state.setHot(id);
      isHovered = true;

      // Handle mouse down - set active
      if (input.isMouseDown()) {
        state.setActive(id);
        input.consumeInput();
      }
    }

    // Check if this button is currently pressed
    isPressed = state.isActive(id);

    // Handle click - mouse up while active and in bounds
    if (isPressed && input.isMouseUp()) {
      if (isInBounds) {
        clicked = true;
      }
      state.clearActive();
    }
  }

  // Determine background color based on state
  let bgColor = theme.background;
  if (disabled) {
    bgColor = theme.disabled;
  } else if (isPressed) {
    bgColor = theme.pressed;
  } else if (isHovered) {
    bgColor = theme.hover;
  }

  // Render background
  ui.fillRect(x, y, width, height, bgColor);

  // Render border
  if (theme.borderWidth > 0) {
    ui.strokeRect(x, y, width, height, theme.borderColor, theme.borderWidth);
  }

  // Render centered label
  // Offset by 0.1 * fontSize to account for visual weight being above geometric center
  const textX = x + width / 2;
  const textY = y + height / 2 + theme.fontSize * 0.1;
  ui.label(label, textX, textY, {
    color: theme.textColor,
    fontSize: theme.fontSize,
    align: "center",
  });

  return {
    clicked,
    isHovered,
    isPressed,
  };
}
