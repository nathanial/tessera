/**
 * Immediate Mode UI System
 *
 * Imgui-style immediate mode UI for WebGL rendering.
 */

// Core
export { UIContext, type UIContextOptions, type FrameContext, type ViewBounds, type LabelStyle, type Rect } from "./UIContext";
export { WidgetState, type WidgetId } from "./WidgetState";
export { InputLayer, type MouseState } from "./InputLayer";

// Theme
export {
  type UITheme,
  type Color,
  type ButtonTheme,
  type PanelTheme,
  type ScrollbarTheme,
  type LabelTheme,
  type ListTheme,
  DEFAULT_THEME,
  mergeTheme,
} from "./UITheme";

// Widgets
export {
  scrollbar,
  type ScrollbarConfig,
  type ScrollbarResult,
  virtualList,
  type VirtualListConfig,
  type VirtualListResult,
  type ItemRect,
} from "./widgets";
