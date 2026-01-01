/**
 * Runtime Font Atlas Generator
 *
 * Creates a simple font atlas using Canvas 2D for demo/development purposes.
 * Note: This is not a true SDF atlas - it uses regular alpha for edge detection.
 * For production, use a proper SDF generator tool like msdf-bmfont-xml.
 */

import type { FontAtlasMetadata, GlyphMetrics } from "./types";

/** Characters to include in the atlas */
const DEFAULT_CHARSET =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

export interface FontAtlasOptions {
  /** Font family (default: "Arial") */
  fontFamily?: string;
  /** Base font size in pixels (default: 48) */
  fontSize?: number;
  /** Atlas texture size (default: 512) */
  atlasSize?: number;
  /** Characters to include (default: ASCII printable) */
  charset?: string;
  /** Padding between glyphs (default: 4) */
  padding?: number;
}

export interface GeneratedFontAtlas {
  /** Font atlas metadata */
  metadata: FontAtlasMetadata;
  /** Atlas image as HTMLImageElement */
  image: HTMLImageElement;
  /** Promise that resolves when image is loaded */
  ready: Promise<void>;
}

/**
 * Generate a font atlas at runtime using Canvas 2D.
 *
 * @param options - Font atlas generation options
 * @returns Generated atlas with metadata and image
 */
export function createFontAtlas(
  options: FontAtlasOptions = {}
): GeneratedFontAtlas {
  const {
    fontFamily = "Arial, sans-serif",
    fontSize = 48,
    atlasSize = 512,
    charset = DEFAULT_CHARSET,
    padding = 4,
  } = options;

  // Create canvas for atlas
  const canvas = document.createElement("canvas");
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext("2d")!;

  // Clear with transparent black
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // Set up font
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "white";

  // Measure and pack glyphs
  const glyphs: Record<number, GlyphMetrics> = {};
  let cursorX = padding;
  let cursorY = padding;
  let rowHeight = 0;

  for (const char of charset) {
    const charCode = char.charCodeAt(0);
    const metrics = ctx.measureText(char);

    // Calculate glyph dimensions
    const width = Math.ceil(metrics.width) + 2;
    const height = fontSize + 4;

    // Check if we need to wrap to next row
    if (cursorX + width + padding > atlasSize) {
      cursorX = padding;
      cursorY += rowHeight + padding;
      rowHeight = 0;
    }

    // Check if we've run out of space
    if (cursorY + height + padding > atlasSize) {
      console.warn(`Font atlas full, stopping at character '${char}'`);
      break;
    }

    // Draw character
    ctx.fillText(char, cursorX + 1, cursorY + 2);

    // Store glyph metrics
    glyphs[charCode] = {
      id: charCode,
      x: cursorX,
      y: cursorY,
      width: width,
      height: height,
      xOffset: 0,
      yOffset: 0,
      xAdvance: Math.ceil(metrics.width),
    };

    // Advance cursor
    cursorX += width + padding;
    rowHeight = Math.max(rowHeight, height);
  }

  // Create metadata
  const metadata: FontAtlasMetadata = {
    name: fontFamily,
    size: fontSize,
    atlasWidth: atlasSize,
    atlasHeight: atlasSize,
    sdfSpread: 4, // Fake SDF spread for shader compatibility
    lineHeight: fontSize * 1.2,
    baseline: fontSize * 0.8,
    glyphs,
  };

  // Convert canvas to image
  const dataUrl = canvas.toDataURL("image/png");
  const image = new Image();

  const ready = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
  });

  image.src = dataUrl;

  return { metadata, image, ready };
}
