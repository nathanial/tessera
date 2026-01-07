/**
 * Immediate mode drawing state
 *
 * Tracks current fill/stroke styles and line properties.
 * Supports save/restore for state stack management.
 */

import type { Color } from "../types/color";
export type { Color };
export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";

export interface DrawStateValues {
  fillStyle: Color;
  strokeStyle: Color;
  lineWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
  globalAlpha: number;
}

const DEFAULT_STATE: DrawStateValues = {
  fillStyle: [0, 0, 0, 1],
  strokeStyle: [0, 0, 0, 1],
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  globalAlpha: 1,
};

export class DrawState {
  private current: DrawStateValues;
  private stack: DrawStateValues[] = [];

  constructor() {
    this.current = { ...DEFAULT_STATE };
  }

  // Fill style
  get fillStyle(): Color {
    return this.current.fillStyle;
  }

  set fillStyle(color: Color) {
    this.current.fillStyle = color;
  }

  // Stroke style
  get strokeStyle(): Color {
    return this.current.strokeStyle;
  }

  set strokeStyle(color: Color) {
    this.current.strokeStyle = color;
  }

  // Line width
  get lineWidth(): number {
    return this.current.lineWidth;
  }

  set lineWidth(width: number) {
    this.current.lineWidth = Math.max(0, width);
  }

  // Line cap
  get lineCap(): LineCap {
    return this.current.lineCap;
  }

  set lineCap(cap: LineCap) {
    this.current.lineCap = cap;
  }

  // Line join
  get lineJoin(): LineJoin {
    return this.current.lineJoin;
  }

  set lineJoin(join: LineJoin) {
    this.current.lineJoin = join;
  }

  // Miter limit
  get miterLimit(): number {
    return this.current.miterLimit;
  }

  set miterLimit(limit: number) {
    this.current.miterLimit = Math.max(1, limit);
  }

  // Global alpha
  get globalAlpha(): number {
    return this.current.globalAlpha;
  }

  set globalAlpha(alpha: number) {
    this.current.globalAlpha = Math.max(0, Math.min(1, alpha));
  }

  /**
   * Get effective fill color with global alpha applied
   */
  getEffectiveFillColor(): Color {
    const [r, g, b, a] = this.current.fillStyle;
    return [r, g, b, a * this.current.globalAlpha];
  }

  /**
   * Get effective stroke color with global alpha applied
   */
  getEffectiveStrokeColor(): Color {
    const [r, g, b, a] = this.current.strokeStyle;
    return [r, g, b, a * this.current.globalAlpha];
  }

  /**
   * Push current state onto the stack
   */
  save(): void {
    this.stack.push({
      fillStyle: [...this.current.fillStyle] as Color,
      strokeStyle: [...this.current.strokeStyle] as Color,
      lineWidth: this.current.lineWidth,
      lineCap: this.current.lineCap,
      lineJoin: this.current.lineJoin,
      miterLimit: this.current.miterLimit,
      globalAlpha: this.current.globalAlpha,
    });
  }

  /**
   * Pop state from the stack
   */
  restore(): void {
    const state = this.stack.pop();
    if (state) {
      this.current = state;
    }
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.current = { ...DEFAULT_STATE };
    this.stack = [];
  }
}
