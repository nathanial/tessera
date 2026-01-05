/**
 * Widget State Manager
 *
 * Tracks hot (hovered) and active (pressed) widget states,
 * plus persistent state like scroll positions.
 */

export type WidgetId = string;

/**
 * Manages widget interaction state following the imgui pattern.
 */
export class WidgetState {
  /** Currently hovered widget (recalculated each frame) */
  private hot: WidgetId | null = null;

  /** Currently pressed/active widget */
  private active: WidgetId | null = null;

  /** Persistent state per widget (scroll positions, etc.) */
  private persistent = new Map<WidgetId, unknown>();

  /**
   * Reset frame state. Called at the start of each frame.
   */
  beginFrame(): void {
    // Hot state is recalculated each frame based on mouse position
    this.hot = null;
  }

  /**
   * Set the hot (hovered) widget.
   * Only the topmost widget under the cursor should call this.
   */
  setHot(id: WidgetId): void {
    this.hot = id;
  }

  /**
   * Check if a widget is hot (hovered).
   */
  isHot(id: WidgetId): boolean {
    return this.hot === id;
  }

  /**
   * Get the current hot widget ID, or null if none.
   */
  getHot(): WidgetId | null {
    return this.hot;
  }

  /**
   * Set the active (pressed) widget.
   * Called when mouse is pressed over a widget.
   */
  setActive(id: WidgetId): void {
    this.active = id;
  }

  /**
   * Clear the active widget.
   * Called when mouse is released.
   */
  clearActive(): void {
    this.active = null;
  }

  /**
   * Check if a widget is active (pressed).
   */
  isActive(id: WidgetId): boolean {
    return this.active === id;
  }

  /**
   * Get the current active widget ID, or null if none.
   */
  getActive(): WidgetId | null {
    return this.active;
  }

  /**
   * Check if any widget is currently active.
   */
  hasActive(): boolean {
    return this.active !== null;
  }

  /**
   * Get persistent state for a widget.
   * Returns the default value if no state exists.
   */
  getState<T>(id: WidgetId, defaultValue: T): T {
    const value = this.persistent.get(id);
    return value !== undefined ? (value as T) : defaultValue;
  }

  /**
   * Set persistent state for a widget.
   */
  setState<T>(id: WidgetId, value: T): void {
    this.persistent.set(id, value);
  }

  /**
   * Delete persistent state for a widget.
   */
  deleteState(id: WidgetId): void {
    this.persistent.delete(id);
  }

  /**
   * Clear all persistent state.
   */
  clearAllState(): void {
    this.persistent.clear();
  }
}
