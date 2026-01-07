/**
 * Button Widget
 *
 * Clickable button for the immediate mode UI system.
 */

import type { UIContext } from "../UIContext";
import { pressable } from "./interaction";

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
  const { isHovered, isPressed, clicked } = pressable(
    ui,
    id,
    { x, y, width, height },
    { disabled }
  );

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
