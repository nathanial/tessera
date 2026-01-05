/**
 * Input Layer
 *
 * Captures mouse/keyboard events for UI interaction.
 * Tracks mouse state and provides query methods.
 */

import type { Mat3 } from "../math/mat3";

export interface MouseState {
  /** Screen X position in pixels */
  x: number;
  /** Screen Y position in pixels */
  y: number;
  /** Bitmask of pressed buttons (1=left, 2=right, 4=middle) */
  buttons: number;
}

/**
 * Manages input state for UI widgets.
 */
export class InputLayer {
  private canvas: HTMLCanvasElement;
  private current: MouseState;
  private previous: MouseState;
  private wheelDelta: number = 0;
  private frameWheelDelta: number = 0;
  private consumed: boolean = false;
  private modifiers = { ctrl: false, meta: false, shift: false, alt: false };
  private mouseDownThisFrame: number = 0; // Bitmask of buttons pressed this frame
  private mouseUpThisFrame: number = 0;   // Bitmask of buttons released this frame

  // Keyboard state
  private keysDownThisFrame: Set<string> = new Set();
  private keysUpThisFrame: Set<string> = new Set();
  private keysHeld: Set<string> = new Set();
  private inputBuffer: string[] = []; // Characters typed this frame

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.current = { x: 0, y: 0, buttons: 0 };
    this.previous = { x: 0, y: 0, buttons: 0 };
    this.attachListeners();
  }

  private attachListeners(): void {
    // Use capture phase to intercept before other handlers
    this.canvas.addEventListener("mousedown", this.onMouseDown, { capture: true });
    this.canvas.addEventListener("mouseup", this.onMouseUp, { capture: true });
    this.canvas.addEventListener("mousemove", this.onMouseMove, { capture: true });
    this.canvas.addEventListener("wheel", this.onWheel, { capture: true, passive: true });
    this.canvas.addEventListener("mouseleave", this.onMouseLeave, { capture: true });

    // Keyboard events on document (global)
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
  }

  private updateModifiers(e: MouseEvent): void {
    this.modifiers.ctrl = e.ctrlKey;
    this.modifiers.meta = e.metaKey;
    this.modifiers.shift = e.shiftKey;
    this.modifiers.alt = e.altKey;
  }

  private onMouseDown = (e: MouseEvent): void => {
    // Track which buttons were just pressed
    const newButtons = e.buttons & ~this.current.buttons;
    this.mouseDownThisFrame |= newButtons;
    this.current.buttons = e.buttons;
    this.updateModifiers(e);
  };

  private onMouseUp = (e: MouseEvent): void => {
    // Track which buttons were just released
    const releasedButtons = this.current.buttons & ~e.buttons;
    this.mouseUpThisFrame |= releasedButtons;
    this.current.buttons = e.buttons;
    this.updateModifiers(e);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Scale by DPR to match canvas device pixel coordinates
    this.current.x = (e.clientX - rect.left) * dpr;
    this.current.y = (e.clientY - rect.top) * dpr;
    this.current.buttons = e.buttons;
    this.updateModifiers(e);
  };

  private onWheel = (e: WheelEvent): void => {
    // Accumulate wheel delta until next frame
    this.wheelDelta += e.deltaY;
  };

  private onMouseLeave = (_e: MouseEvent): void => {
    // Clear position when mouse leaves canvas
    this.current.x = -1;
    this.current.y = -1;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysDownThisFrame.add(e.key);
    this.keysHeld.add(e.key);

    // Buffer printable characters (single char, not modified by ctrl/meta)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      this.inputBuffer.push(e.key);
    }

    // Update modifiers from keyboard events too
    this.modifiers.ctrl = e.ctrlKey;
    this.modifiers.meta = e.metaKey;
    this.modifiers.shift = e.shiftKey;
    this.modifiers.alt = e.altKey;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysUpThisFrame.add(e.key);
    this.keysHeld.delete(e.key);

    this.modifiers.ctrl = e.ctrlKey;
    this.modifiers.meta = e.metaKey;
    this.modifiers.shift = e.shiftKey;
    this.modifiers.alt = e.altKey;
  };

  /**
   * Called at the start of each frame.
   * Captures current state and resets per-frame values.
   */
  beginFrame(): void {
    this.previous = { ...this.current };
    this.frameWheelDelta = this.wheelDelta;
    this.wheelDelta = 0;
    this.consumed = false;
  }

  /**
   * Called at the end of each frame.
   */
  endFrame(): void {
    // Clear per-frame mouse button flags
    this.mouseDownThisFrame = 0;
    this.mouseUpThisFrame = 0;

    // Clear per-frame keyboard state
    this.keysDownThisFrame.clear();
    this.keysUpThisFrame.clear();
    this.inputBuffer = [];
  }

  /**
   * Get current mouse position in screen pixels.
   */
  getMousePosition(): { x: number; y: number } {
    return { x: this.current.x, y: this.current.y };
  }

  /**
   * Get mouse position in world coordinates.
   */
  getWorldMousePosition(
    matrix: Mat3,
    viewportWidth: number,
    viewportHeight: number
  ): { x: number; y: number } {
    const { x, y } = this.current;

    // Screen to clip space
    const clipX = (x / viewportWidth) * 2 - 1;
    const clipY = 1 - (y / viewportHeight) * 2; // Y flipped

    // Invert matrix (assuming [a,b,0,c,d,0,tx,ty,1] column-major)
    const a = matrix[0]!,
      b = matrix[3]!;
    const c = matrix[1]!,
      d = matrix[4]!;
    const tx = matrix[6]!,
      ty = matrix[7]!;

    const det = a * d - b * c;
    const worldX = (d * (clipX - tx) - b * (clipY - ty)) / det;
    const worldY = (-c * (clipX - tx) + a * (clipY - ty)) / det;

    return { x: worldX, y: worldY };
  }

  /**
   * Check if mouse button was just pressed this frame.
   */
  isMouseDown(button: number = 1): boolean {
    return (this.mouseDownThisFrame & button) !== 0;
  }

  /**
   * Check if mouse button was just released this frame.
   */
  isMouseUp(button: number = 1): boolean {
    return (this.mouseUpThisFrame & button) !== 0;
  }

  /**
   * Check if mouse button is currently held.
   */
  isMouseHeld(button: number = 1): boolean {
    return (this.current.buttons & button) !== 0;
  }

  /**
   * Get accumulated wheel delta for this frame.
   * Positive = scroll down, negative = scroll up.
   */
  getWheelDelta(): number {
    return this.frameWheelDelta;
  }

  /**
   * Check if a key was just pressed this frame.
   */
  isKeyDown(key: string): boolean {
    return this.keysDownThisFrame.has(key);
  }

  /**
   * Check if a key was just released this frame.
   */
  isKeyUp(key: string): boolean {
    return this.keysUpThisFrame.has(key);
  }

  /**
   * Check if a key is currently held.
   */
  isKeyHeld(key: string): boolean {
    return this.keysHeld.has(key);
  }

  /**
   * Get characters typed this frame (printable keys only).
   */
  getInputBuffer(): string[] {
    return this.inputBuffer;
  }

  /**
   * Mark input as consumed by UI (prevents map interaction).
   */
  consumeInput(): void {
    this.consumed = true;
  }

  /**
   * Check if input was consumed by UI this frame.
   */
  wasConsumed(): boolean {
    return this.consumed;
  }

  /**
   * Check if mouse is inside a rectangle.
   */
  isMouseInRect(x: number, y: number, width: number, height: number): boolean {
    const mx = this.current.x;
    const my = this.current.y;
    return mx >= x && mx <= x + width && my >= y && my <= y + height;
  }

  /**
   * Check if multi-select modifier is held (Cmd on Mac, Ctrl on Windows/Linux).
   */
  isMultiSelectModifier(): boolean {
    return this.modifiers.meta || this.modifiers.ctrl;
  }

  /**
   * Clean up event listeners.
   */
  destroy(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown, { capture: true });
    this.canvas.removeEventListener("mouseup", this.onMouseUp, { capture: true });
    this.canvas.removeEventListener("mousemove", this.onMouseMove, { capture: true });
    this.canvas.removeEventListener("wheel", this.onWheel, { capture: true });
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave, { capture: true });
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
  }
}
