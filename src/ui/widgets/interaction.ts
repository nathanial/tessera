import type { UIContext, Rect } from "../UIContext";

export interface PressableState {
  isHovered: boolean;
  isPressed: boolean;
  clicked: boolean;
}

export interface PressableOptions {
  disabled?: boolean;
}

export function pressable(
  ui: UIContext,
  id: string,
  rect: Rect,
  options: PressableOptions = {}
): PressableState {
  const { disabled = false } = options;
  const input = ui.getInput();
  const state = ui.getState();

  const mouse = input.getMousePosition();
  const isInBounds = ui.pointInRect(mouse.x, mouse.y, rect);

  let isHovered = false;
  let isPressed = false;
  let clicked = false;

  if (!disabled) {
    if (isInBounds) {
      ui.setHovered();
      state.setHot(id);
      isHovered = true;

      if (input.isMouseDown()) {
        state.setActive(id);
        input.consumeInput();
      }
    }

    isPressed = state.isActive(id);

    if (isPressed && input.isMouseUp()) {
      if (isInBounds) {
        clicked = true;
      }
      state.clearActive();
    }
  }

  return { isHovered, isPressed, clicked };
}
