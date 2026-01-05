/**
 * UI Theme
 *
 * Configurable theme system for immediate mode UI widgets.
 * All colors are RGBA in 0-1 range.
 */

/** RGBA color in 0-1 range */
export type Color = [number, number, number, number];

export interface ButtonTheme {
  background: Color;
  hover: Color;
  pressed: Color;
  disabled: Color;
  textColor: Color;
  fontSize: number;
  padding: number;
  borderRadius: number;
  borderColor: Color;
  borderWidth: number;
}

export interface PanelTheme {
  background: Color;
  borderColor: Color;
  borderWidth: number;
  borderRadius: number;
  padding: number;
}

export interface ScrollbarTheme {
  trackColor: Color;
  thumbColor: Color;
  thumbHoverColor: Color;
  thumbActiveColor: Color;
  width: number;
  minThumbSize: number;
  borderRadius: number;
}

export interface LabelTheme {
  color: Color;
  fontSize: number;
  haloColor: Color;
  haloWidth: number;
}

export interface ListTheme {
  itemHeight: number;
  itemPadding: number;
  itemBackground: Color;
  itemAltBackground: Color;
  itemHoverBackground: Color;
  itemSelectedBackground: Color;
  itemTextColor: Color;
  itemSelectedTextColor: Color;
  fontSize: number;
  dividerColor: Color;
  dividerWidth: number;
}

export interface UITheme {
  button: ButtonTheme;
  panel: PanelTheme;
  scrollbar: ScrollbarTheme;
  label: LabelTheme;
  list: ListTheme;
}

/** Default dark theme with transparency */
export const DEFAULT_THEME: UITheme = {
  button: {
    background: [0.2, 0.2, 0.2, 0.9],
    hover: [0.3, 0.3, 0.3, 0.9],
    pressed: [0.15, 0.15, 0.15, 0.95],
    disabled: [0.15, 0.15, 0.15, 0.5],
    textColor: [1, 1, 1, 0.9],
    fontSize: 14,
    padding: 8,
    borderRadius: 4,
    borderColor: [0.4, 0.4, 0.4, 0.5],
    borderWidth: 1,
  },
  panel: {
    background: [0.08, 0.08, 0.08, 0.92],
    borderColor: [0.3, 0.3, 0.3, 0.6],
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
  },
  scrollbar: {
    trackColor: [0.15, 0.15, 0.15, 0.8],
    thumbColor: [0.4, 0.4, 0.4, 0.8],
    thumbHoverColor: [0.5, 0.5, 0.5, 0.9],
    thumbActiveColor: [0.6, 0.6, 0.6, 1.0],
    width: 12,
    minThumbSize: 24,
    borderRadius: 6,
  },
  label: {
    color: [1, 1, 1, 0.9],
    fontSize: 14,
    haloColor: [0, 0, 0, 0.7],
    haloWidth: 1.5,
  },
  list: {
    itemHeight: 28,
    itemPadding: 8,
    itemBackground: [0.1, 0.1, 0.1, 0.8],
    itemAltBackground: [0.12, 0.12, 0.12, 0.8],
    itemHoverBackground: [0.25, 0.25, 0.25, 0.8],
    itemSelectedBackground: [0.2, 0.4, 0.6, 0.8],
    itemTextColor: [0.9, 0.9, 0.9, 1.0],
    itemSelectedTextColor: [1, 1, 1, 1.0],
    fontSize: 13,
    dividerColor: [1, 1, 1, 0.08],
    dividerWidth: 1,
  },
};

/** Deep merge a partial theme with the default theme */
export function mergeTheme(partial: Partial<UITheme>): UITheme {
  return {
    button: { ...DEFAULT_THEME.button, ...partial.button },
    panel: { ...DEFAULT_THEME.panel, ...partial.panel },
    scrollbar: { ...DEFAULT_THEME.scrollbar, ...partial.scrollbar },
    label: { ...DEFAULT_THEME.label, ...partial.label },
    list: { ...DEFAULT_THEME.list, ...partial.list },
  };
}
