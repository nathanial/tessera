/**
 * Text Input Widget
 *
 * Single-line text input for the immediate mode UI system.
 */

import type { UIContext } from "../UIContext";

/** Text input configuration */
export interface TextInputConfig {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholder?: string;
  maxLength?: number;
  value?: string; // Controlled value (optional)
}

/** Text input result */
export interface TextInputResult {
  value: string;
  isFocused: boolean;
  changed: boolean;
  submitted: boolean;
}

/** Internal text input state */
interface TextInputState {
  text: string;
  cursorIndex: number;
  blinkTime: number;
}

/**
 * Render a text input field.
 */
export function textInput(ui: UIContext, config: TextInputConfig): TextInputResult {
  const { id, x, y, width, height, placeholder, maxLength, value } = config;
  const theme = ui.getTheme().textInput;
  const input = ui.getInput();
  const state = ui.getState();

  // Get persistent state
  const inputState = state.getState<TextInputState>(id, {
    text: value ?? "",
    cursorIndex: 0,
    blinkTime: 0,
  });

  // Sync with controlled value if provided
  if (value !== undefined && value !== inputState.text) {
    inputState.text = value;
    inputState.cursorIndex = Math.min(inputState.cursorIndex, value.length);
  }

  // Track focus via active state
  const mouse = input.getMousePosition();
  const isInBounds = ui.pointInRect(mouse.x, mouse.y, { x, y, width, height });
  const wasFocused = state.isActive(id);
  let isFocused = wasFocused;

  // Handle mouse focus
  if (isInBounds) {
    ui.setHovered();

    if (input.isMouseDown()) {
      state.setActive(id);
      isFocused = true;

      // Place cursor at click position (approximate)
      const relX = mouse.x - (x + theme.padding);
      const charWidth = theme.fontSize * 0.6;
      const clickIndex = Math.round(relX / charWidth);
      inputState.cursorIndex = Math.max(0, Math.min(inputState.text.length, clickIndex));
      inputState.blinkTime = 0; // Reset blink on click

      input.consumeInput();
    }
  }

  // Handle keyboard input when focused
  let changed = false;
  let submitted = false;

  if (isFocused) {
    // Check for blur (click outside or Escape)
    if (input.isMouseDown() && !isInBounds) {
      state.clearActive();
      isFocused = false;
    } else if (input.isKeyDown("Escape")) {
      state.clearActive();
      isFocused = false;
    }

    if (isFocused) {
      // Handle special keys
      if (input.isKeyDown("Backspace")) {
        if (inputState.cursorIndex > 0) {
          inputState.text =
            inputState.text.slice(0, inputState.cursorIndex - 1) +
            inputState.text.slice(inputState.cursorIndex);
          inputState.cursorIndex--;
          changed = true;
          inputState.blinkTime = 0;
        }
      } else if (input.isKeyDown("Delete")) {
        if (inputState.cursorIndex < inputState.text.length) {
          inputState.text =
            inputState.text.slice(0, inputState.cursorIndex) +
            inputState.text.slice(inputState.cursorIndex + 1);
          changed = true;
          inputState.blinkTime = 0;
        }
      } else if (input.isKeyDown("ArrowLeft")) {
        inputState.cursorIndex = Math.max(0, inputState.cursorIndex - 1);
        inputState.blinkTime = 0;
      } else if (input.isKeyDown("ArrowRight")) {
        inputState.cursorIndex = Math.min(inputState.text.length, inputState.cursorIndex + 1);
        inputState.blinkTime = 0;
      } else if (input.isKeyDown("Home")) {
        inputState.cursorIndex = 0;
        inputState.blinkTime = 0;
      } else if (input.isKeyDown("End")) {
        inputState.cursorIndex = inputState.text.length;
        inputState.blinkTime = 0;
      } else if (input.isKeyDown("Enter")) {
        submitted = true;
      }

      // Handle character input
      const chars = input.getInputBuffer();
      for (const char of chars) {
        if (maxLength === undefined || inputState.text.length < maxLength) {
          inputState.text =
            inputState.text.slice(0, inputState.cursorIndex) +
            char +
            inputState.text.slice(inputState.cursorIndex);
          inputState.cursorIndex++;
          changed = true;
          inputState.blinkTime = 0;
        }
      }
    }
  }

  // Update blink animation (approximate 16ms per frame)
  inputState.blinkTime += 16;
  const blinkPeriod = 1000;
  const blinkPhase = (inputState.blinkTime % blinkPeriod) / blinkPeriod;
  const cursorVisible = isFocused && blinkPhase < 0.5;

  // Render background
  const bgColor = isFocused ? theme.focusBackground : theme.background;
  ui.fillRect(x, y, width, height, bgColor);

  // Render border
  const borderColor = isFocused ? theme.focusBorderColor : theme.borderColor;
  ui.strokeRect(x, y, width, height, borderColor, 1);

  // Calculate text position
  // Offset by 0.1 * fontSize to account for visual weight being above geometric center
  const textX = x + theme.padding;
  const textY = y + height / 2 + theme.fontSize * 0.1;

  // Set up clipping for text overflow
  ui.pushClipRect(x + 2, y + 2, width - 4, height - 4);

  // Render text or placeholder
  if (inputState.text.length === 0 && placeholder && !isFocused) {
    ui.label(placeholder, textX, textY, {
      color: theme.placeholderColor,
      fontSize: theme.fontSize,
      align: "left",
    });
  } else {
    ui.label(inputState.text, textX, textY, {
      color: theme.textColor,
      fontSize: theme.fontSize,
      align: "left",
    });
  }

  // Render cursor
  if (cursorVisible) {
    const charWidth = theme.fontSize * 0.6;
    const cursorX = textX + inputState.cursorIndex * charWidth;
    const cursorTop = y + theme.padding;
    const cursorBottom = y + height - theme.padding;

    ui.beginPath();
    ui.moveTo(cursorX, cursorTop);
    ui.lineTo(cursorX, cursorBottom);
    ui.strokePath(theme.cursorColor, 2);
  }

  // Remove clipping
  ui.popClipRect();

  // Save state
  state.setState(id, inputState);

  return {
    value: inputState.text,
    isFocused,
    changed,
    submitted,
  };
}
