/**
 * UI Context
 *
 * Main entry point for immediate mode UI rendering.
 * Wraps DrawContext and SDFRenderer for widget rendering.
 */

import { DrawContext } from "../immediate/DrawContext";
import { SDFRenderer } from "../sdf/SDFRenderer";
import { projection, type Mat3 } from "../math/mat3";
import { WidgetState } from "./WidgetState";
import { InputLayer } from "./InputLayer";
import {
  type UITheme,
  type Color,
  DEFAULT_THEME,
  mergeTheme,
} from "./UITheme";
import type { TextStyle } from "../sdf/types";

/** View bounds in world coordinates */
export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Frame context passed to beginFrame */
export interface FrameContext {
  viewportWidth: number;
  viewportHeight: number;
  worldMatrix: Mat3;
  bounds: ViewBounds;
}

/** Label style options */
export interface LabelStyle {
  color?: Color;
  fontSize?: number;
  haloColor?: Color;
  haloWidth?: number;
  align?: "left" | "center" | "right";
}

/** Rectangle for hit testing and layout */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CoordinateMode = "screen" | "world";

export interface UIContextOptions {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  drawContext: DrawContext;
  sdfRenderer: SDFRenderer;
  theme?: Partial<UITheme>;
}

/**
 * Immediate mode UI context.
 *
 * Provides widgets that are called each frame to build the UI.
 * Integrates with DrawContext for shapes and SDFRenderer for text.
 */
export class UIContext {
  readonly gl: WebGL2RenderingContext;
  readonly drawContext: DrawContext;
  readonly sdfRenderer: SDFRenderer;

  private theme: UITheme;
  private state: WidgetState;
  private input: InputLayer;

  // Frame state
  private inFrame: boolean = false;
  private frame: FrameContext | null = null;
  private screenMatrix: Mat3 | null = null;

  // Coordinate space
  private coordinateStack: CoordinateMode[] = [];
  private currentMatrix: Mat3 | null = null;
  private isDrawing: boolean = false;

  // Hover tracking
  private uiHovered: boolean = false;

  constructor(options: UIContextOptions) {
    this.gl = options.gl;
    this.drawContext = options.drawContext;
    this.sdfRenderer = options.sdfRenderer;
    this.theme = options.theme ? mergeTheme(options.theme) : DEFAULT_THEME;
    this.state = new WidgetState();
    this.input = new InputLayer(options.canvas);
  }

  // ==================== Frame Lifecycle ====================

  /**
   * Begin a new UI frame.
   * Must be called before any widget rendering.
   */
  beginFrame(context: FrameContext): void {
    if (this.inFrame) {
      throw new Error("Already in UI frame - call endFrame() first");
    }

    this.frame = context;
    this.inFrame = true;
    this.uiHovered = false;

    // Create screen-space projection matrix
    this.screenMatrix = projection(context.viewportWidth, context.viewportHeight);

    // Reset coordinate space to screen by default
    this.coordinateStack = ["screen"];
    this.currentMatrix = this.screenMatrix;

    // Begin input and state tracking
    this.input.beginFrame();
    this.state.beginFrame();

    // Clear SDF text for new frame
    this.sdfRenderer.clearText();
  }

  /**
   * End the UI frame and flush all rendering.
   */
  endFrame(): void {
    if (!this.inFrame || !this.frame) {
      throw new Error("Not in UI frame - call beginFrame() first");
    }

    // Flush any pending draw commands
    this.flushDrawing();

    // Render accumulated SDF text
    if (this.currentMatrix) {
      this.sdfRenderer.render(
        this.currentMatrix,
        this.frame.viewportWidth,
        this.frame.viewportHeight
      );
    }

    this.input.endFrame();
    this.inFrame = false;
    this.frame = null;
    this.screenMatrix = null;
    this.currentMatrix = null;
    this.coordinateStack = [];
  }

  // ==================== Coordinate Space ====================

  /**
   * Push screen-space coordinate system.
   * Origin at top-left, units in pixels.
   */
  pushScreenSpace(): void {
    this.flushDrawing();
    this.coordinateStack.push("screen");
    this.currentMatrix = this.screenMatrix;
  }

  /**
   * Push world-space coordinate system.
   * Uses camera transform.
   */
  pushWorldSpace(): void {
    this.flushDrawing();
    this.coordinateStack.push("world");
    this.currentMatrix = this.frame?.worldMatrix ?? null;
  }

  /**
   * Pop the current coordinate space.
   */
  popCoordinateSpace(): void {
    // Flush before switching
    this.flushDrawing();

    // Also flush SDF text with current matrix before switching
    if (this.currentMatrix && this.frame) {
      this.sdfRenderer.render(
        this.currentMatrix,
        this.frame.viewportWidth,
        this.frame.viewportHeight
      );
      this.sdfRenderer.clearText();
    }

    this.coordinateStack.pop();
    const mode = this.coordinateStack[this.coordinateStack.length - 1] ?? "screen";
    this.currentMatrix = mode === "world" ? this.frame?.worldMatrix ?? null : this.screenMatrix;
  }

  // ==================== Drawing Helpers ====================

  private beginDrawing(): void {
    if (this.isDrawing || !this.currentMatrix || !this.frame) return;

    this.drawContext.begin(
      this.currentMatrix,
      this.frame.viewportWidth,
      this.frame.viewportHeight
    );
    this.isDrawing = true;
  }

  private flushDrawing(): void {
    if (!this.isDrawing) return;

    this.drawContext.end();
    this.isDrawing = false;
  }

  // ==================== Input & Hit Testing ====================

  /**
   * Check if UI is being hovered this frame.
   * Use this to block map interaction.
   */
  isHoveringUI(): boolean {
    return this.uiHovered;
  }

  /**
   * Mark UI as being hovered (call from widgets).
   */
  setHovered(): void {
    this.uiHovered = true;
  }

  /**
   * Get current mouse position in screen pixels.
   */
  getMousePosition(): { x: number; y: number } {
    return this.input.getMousePosition();
  }

  /**
   * Get current mouse position in world coordinates.
   */
  getWorldMousePosition(): { x: number; y: number } {
    if (!this.frame) return { x: 0, y: 0 };
    return this.input.getWorldMousePosition(
      this.frame.worldMatrix,
      this.frame.viewportWidth,
      this.frame.viewportHeight
    );
  }

  /**
   * Check if a point is inside a rectangle.
   */
  pointInRect(x: number, y: number, rect: Rect): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  // ==================== Accessors ====================

  /** Get the current theme */
  getTheme(): UITheme {
    return this.theme;
  }

  /** Set a new theme */
  setTheme(theme: Partial<UITheme>): void {
    this.theme = mergeTheme(theme);
  }

  /** Get widget state manager */
  getState(): WidgetState {
    return this.state;
  }

  /** Get input layer */
  getInput(): InputLayer {
    return this.input;
  }

  /** Get current frame context */
  getFrame(): FrameContext | null {
    return this.frame;
  }

  /** Get current viewport dimensions */
  getViewport(): { width: number; height: number } {
    return {
      width: this.frame?.viewportWidth ?? 0,
      height: this.frame?.viewportHeight ?? 0,
    };
  }

  // ==================== Basic Widgets ====================

  /**
   * Render a text label.
   */
  label(text: string, x: number, y: number, style?: Partial<LabelStyle>): void {
    const theme = this.theme.label;
    const merged: TextStyle = {
      color: style?.color ?? theme.color,
      fontSize: style?.fontSize ?? theme.fontSize,
      haloColor: style?.haloColor ?? theme.haloColor,
      haloWidth: style?.haloWidth ?? theme.haloWidth,
      align: style?.align ?? "left",
    };

    this.sdfRenderer.addText(text, x, y, merged);
  }

  /**
   * Begin a panel container.
   * Returns true if the panel is visible.
   */
  beginPanel(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const theme = this.theme.panel;
    const mouse = this.getMousePosition();

    // Check hover
    if (this.pointInRect(mouse.x, mouse.y, { x, y, width, height })) {
      this.uiHovered = true;
    }

    // Draw background
    this.beginDrawing();
    this.drawContext.fillStyle = theme.background;
    this.drawContext.fillRect(x, y, width, height);

    // Draw border
    if (theme.borderWidth > 0) {
      this.drawContext.strokeStyle = theme.borderColor;
      this.drawContext.lineWidth = theme.borderWidth;
      this.drawContext.strokeRect(x, y, width, height);
    }

    return true;
  }

  /**
   * End a panel container.
   */
  endPanel(): void {
    // Currently just a marker - could add scissor clipping in future
  }

  /**
   * Render a filled rectangle.
   */
  fillRect(x: number, y: number, width: number, height: number, color: Color): void {
    this.beginDrawing();
    this.drawContext.fillStyle = color;
    this.drawContext.fillRect(x, y, width, height);
  }

  /**
   * Render a stroked rectangle.
   */
  strokeRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
    lineWidth: number = 1
  ): void {
    this.beginDrawing();
    this.drawContext.strokeStyle = color;
    this.drawContext.lineWidth = lineWidth;
    this.drawContext.strokeRect(x, y, width, height);
  }

  // ==================== Cleanup ====================

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.input.destroy();
  }
}
