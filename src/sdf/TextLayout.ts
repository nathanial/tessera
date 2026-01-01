/**
 * Text Layout Engine
 *
 * Provides text measurement and multi-line layout capabilities.
 */

import type { FontAtlasMetadata } from "./types";

/** Result of text measurement */
export interface TextMeasurement {
  /** Total width of the text */
  width: number;
  /** Total height of the text */
  height: number;
  /** Individual line measurements */
  lines: {
    text: string;
    width: number;
  }[];
}

/** Layout options for text wrapping */
export interface LayoutOptions {
  /** Maximum width before wrapping (pixels) */
  maxWidth?: number;
  /** Line height multiplier (default: 1.2) */
  lineHeightMultiplier?: number;
  /** Word wrap mode: 'word' | 'char' | 'none' */
  wrapMode?: "word" | "char" | "none";
}

/**
 * Text layout engine for SDF text rendering.
 *
 * Provides text measurement and multi-line layout using font atlas metrics.
 */
export class TextLayout {
  private metadata: FontAtlasMetadata;
  private kerningMap: Map<string, number>;

  constructor(metadata: FontAtlasMetadata) {
    this.metadata = metadata;

    // Build kerning lookup for O(1) access
    this.kerningMap = new Map();
    if (metadata.kerning) {
      for (const k of metadata.kerning) {
        this.kerningMap.set(`${k.first},${k.second}`, k.amount);
      }
    }
  }

  /**
   * Measure text dimensions at a given font size.
   *
   * @param text - Text to measure
   * @param fontSize - Target font size in pixels
   * @param options - Layout options
   * @returns Text measurement result
   */
  measure(
    text: string,
    fontSize: number,
    options: LayoutOptions = {}
  ): TextMeasurement {
    const scale = fontSize / this.metadata.size;
    const lineHeight =
      this.metadata.lineHeight * scale * (options.lineHeightMultiplier ?? 1.2);

    // Split into lines based on wrap mode
    const lines = this.wrapText(text, fontSize, options);

    let maxWidth = 0;
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, line.width);
    }

    return {
      width: maxWidth,
      height: lines.length * lineHeight,
      lines,
    };
  }

  /**
   * Measure the width of a single line of text.
   *
   * @param text - Text to measure
   * @param fontSize - Target font size in pixels
   * @returns Width in pixels
   */
  measureLine(text: string, fontSize: number): number {
    const scale = fontSize / this.metadata.size;
    let width = 0;

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const glyph = this.metadata.glyphs[charCode];

      if (glyph) {
        width += glyph.xAdvance * scale;

        if (i < text.length - 1) {
          const nextCode = text.charCodeAt(i + 1);
          width += this.getKerning(charCode, nextCode) * scale;
        }
      }
    }

    return width;
  }

  /**
   * Get kerning value between two characters.
   *
   * @param first - First character code
   * @param second - Second character code
   * @returns Kerning amount in pixels (at base font size)
   */
  getKerning(first: number, second: number): number {
    return this.kerningMap.get(`${first},${second}`) ?? 0;
  }

  /**
   * Wrap text into lines based on layout options.
   */
  private wrapText(
    text: string,
    fontSize: number,
    options: LayoutOptions
  ): { text: string; width: number }[] {
    const maxWidth = options.maxWidth ?? Infinity;
    const wrapMode = options.wrapMode ?? "word";

    if (wrapMode === "none" || maxWidth === Infinity) {
      return [{ text, width: this.measureLine(text, fontSize) }];
    }

    const lines: { text: string; width: number }[] = [];
    const paragraphs = text.split("\n");

    for (const para of paragraphs) {
      if (wrapMode === "word") {
        const words = para.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const width = this.measureLine(testLine, fontSize);

          if (width > maxWidth && currentLine) {
            lines.push({
              text: currentLine,
              width: this.measureLine(currentLine, fontSize),
            });
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          lines.push({
            text: currentLine,
            width: this.measureLine(currentLine, fontSize),
          });
        }
      } else {
        // Character wrap
        let currentLine = "";
        for (const char of para) {
          const testLine = currentLine + char;
          if (
            this.measureLine(testLine, fontSize) > maxWidth &&
            currentLine
          ) {
            lines.push({
              text: currentLine,
              width: this.measureLine(currentLine, fontSize),
            });
            currentLine = char;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          lines.push({
            text: currentLine,
            width: this.measureLine(currentLine, fontSize),
          });
        }
      }
    }

    return lines;
  }

  /**
   * Get the line height at a given font size.
   *
   * @param fontSize - Target font size in pixels
   * @param multiplier - Line height multiplier (default: 1.2)
   * @returns Line height in pixels
   */
  getLineHeight(fontSize: number, multiplier = 1.2): number {
    const scale = fontSize / this.metadata.size;
    return this.metadata.lineHeight * scale * multiplier;
  }

  /**
   * Get the baseline offset at a given font size.
   *
   * @param fontSize - Target font size in pixels
   * @returns Baseline offset in pixels
   */
  getBaseline(fontSize: number): number {
    const scale = fontSize / this.metadata.size;
    return this.metadata.baseline * scale;
  }
}
