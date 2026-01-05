/**
 * Toggle Button Widget
 *
 * On/off toggle button for the immediate mode UI system.
 */

import type { UIContext } from "../UIContext";
import type { Color } from "../UITheme";

/** Toggle button configuration */
export interface ToggleButtonConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isOn: boolean;
  onColor?: Color; // Custom active background color
  offColor?: Color; // Custom inactive background color
}

/** Toggle button result */
export interface ToggleButtonResult {
  toggled: boolean; // Was the button clicked this frame?
  isHovered: boolean;
}

/**
 * Render a toggle button.
 */
export function toggleButton(ui: UIContext, config: ToggleButtonConfig): ToggleButtonResult {
  const { id, x, y, width, height, label, isOn, onColor, offColor } = config;
  const theme = ui.getTheme().toggleButton;
  const input = ui.getInput();
  const state = ui.getState();

  // Get mouse position and check bounds
  const mouse = input.getMousePosition();
  const isInBounds = ui.pointInRect(mouse.x, mouse.y, { x, y, width, height });

  // Track interaction states
  let isHovered = false;
  let toggled = false;

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
  const isPressed = state.isActive(id);

  // Handle click - mouse up while active and in bounds
  if (isPressed && input.isMouseUp()) {
    if (isInBounds) {
      toggled = true;
    }
    state.clearActive();
  }

  // Determine background color based on state
  let bgColor: Color;
  if (isOn) {
    bgColor = onColor ?? (isHovered ? theme.onHover : theme.onBackground);
    if (isPressed) {
      // Darken slightly when pressed
      bgColor = [bgColor[0] * 0.85, bgColor[1] * 0.85, bgColor[2] * 0.85, bgColor[3]];
    }
  } else {
    bgColor = offColor ?? (isHovered ? theme.offHover : theme.offBackground);
    if (isPressed) {
      // Darken slightly when pressed
      bgColor = [bgColor[0] * 0.85, bgColor[1] * 0.85, bgColor[2] * 0.85, bgColor[3]];
    }
  }

  // Render background
  ui.fillRect(x, y, width, height, bgColor);

  // Render border
  ui.strokeRect(x, y, width, height, theme.borderColor, 1);

  // Render centered label with halo for readability
  // Offset by 0.1 * fontSize to account for visual weight being above geometric center
  const textColor = isOn ? theme.onTextColor : theme.offTextColor;
  const textX = x + width / 2;
  const textY = y + height / 2 + theme.fontSize * 0.1;
  ui.label(label, textX, textY, {
    color: textColor,
    fontSize: theme.fontSize,
    align: "center",
    haloColor: theme.haloColor,
    haloWidth: theme.haloWidth,
  });

  return {
    toggled,
    isHovered,
  };
}
