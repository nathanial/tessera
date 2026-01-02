/**
 * Border shape rendering along US state borders.
 * Manages animated shapes that follow state border paths.
 */

import earcut from "earcut";
import type { DrawContext } from "../src/index";
import { loadStateBorderPoints } from "./borders";
import { getWrappedX } from "./CoordinateUtils";

// ============================================
// SHAPE CONFIGURATION
// ============================================

const SHAPE_SIZE = 0.00008;
const BORDER_SPACING = 0.0002; // Spacing between shapes in world units
const WAVE_AMPLITUDE = 0.00015; // How far shapes move from grid position
const WAVE_SPEED = 2.0; // Wave animation speed

// ============================================
// SHAPE TYPES
// ============================================

export type ShapeType = "circle" | "square" | "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star";

const shapeTypes: ShapeType[] = ["circle", "square", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star"];

interface BorderShape {
  baseX: number;
  baseY: number;
  index: number;
  shape: ShapeType;
  baseHue: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

interface ShapeTemplate {
  vertices: number[];
  indices: number[];
}

// ============================================
// SHAPE TEMPLATE GENERATION
// ============================================

function generatePolygonVertices(sides: number, angleOffset: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = angleOffset + (i / sides) * Math.PI * 2;
    verts.push(Math.cos(angle), Math.sin(angle));
  }
  return verts;
}

function generateCircleVertices(segments: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(Math.cos(angle), Math.sin(angle));
  }
  return verts;
}

function generateStarVertices(points: number, innerRatio: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : innerRatio;
    verts.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  return verts;
}

function createTemplate(vertices: number[]): ShapeTemplate {
  return { vertices, indices: earcut(vertices) };
}

// Pre-computed shape templates (tessellated once at startup)
const shapeTemplates: Record<ShapeType, ShapeTemplate> = {
  circle: createTemplate(generateCircleVertices(32)),
  triangle: createTemplate(generatePolygonVertices(3, -Math.PI / 2)),
  square: createTemplate(generatePolygonVertices(4, Math.PI / 4)),
  diamond: createTemplate(generatePolygonVertices(4, 0)),
  pentagon: createTemplate(generatePolygonVertices(5, -Math.PI / 2)),
  hexagon: createTemplate(generatePolygonVertices(6, 0)),
  octagon: createTemplate(generatePolygonVertices(8, Math.PI / 8)),
  star: createTemplate(generateStarVertices(5, 0.4)),
};

// ============================================
// COLOR UTILITIES
// ============================================

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 1/6) { r = c; g = x; b = 0; }
  else if (h < 2/6) { r = x; g = c; b = 0; }
  else if (h < 3/6) { r = 0; g = c; b = x; }
  else if (h < 4/6) { r = 0; g = x; b = c; }
  else if (h < 5/6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [r + m, g + m, b + m];
}

// ============================================
// BORDER RENDERER CLASS
// ============================================

export class BorderRenderer {
  private shapes: BorderShape[] = [];
  private shapesLoaded = false;
  private hueOffset = 0;
  private animTime = 0;

  constructor() {
    console.log("Pre-computed shape templates");
    this.loadShapes();
  }

  private async loadShapes(): Promise<void> {
    const borderPoints = await loadStateBorderPoints(BORDER_SPACING);

    for (let i = 0; i < borderPoints.length; i++) {
      const point = borderPoints[i]!;
      const shapeIndex = i % shapeTypes.length;
      const shapeType = shapeTypes[shapeIndex]!;
      const baseHue = i / borderPoints.length;
      const sizeVariation = 0.7 + ((i * 7) % 5) * 0.1;
      const speedVariation = ((i * 13) % 10) / 10;
      const direction = (i % 2 === 0) ? 1 : -1;
      const rotationSpeed = direction * (0.5 + speedVariation * 1.5);

      this.shapes.push({
        baseX: point.x,
        baseY: point.y,
        index: i,
        shape: shapeType,
        baseHue,
        size: SHAPE_SIZE * sizeVariation,
        rotation: 0,
        rotationSpeed,
      });
    }

    console.log(`Created ${this.shapes.length} shapes along US state borders`);

    // Sort shapes by type for optimal batching
    this.shapes.sort((a, b) => shapeTypes.indexOf(a.shape) - shapeTypes.indexOf(b.shape));
    this.shapesLoaded = true;
  }

  /** Update animation state. Call once per frame. */
  update(dt: number): void {
    for (const shape of this.shapes) {
      shape.rotation += shape.rotationSpeed * dt;
    }
    this.hueOffset += dt * 0.1;
    this.animTime += dt * WAVE_SPEED;
  }

  /** Render all border shapes. */
  render(
    draw: DrawContext,
    bounds: { left: number; right: number; top: number; bottom: number }
  ): void {
    if (!this.shapesLoaded) return;

    for (const shape of this.shapes) {
      // Wave animation
      const wavePhase = shape.index * 0.3 + this.animTime;
      const waveX = Math.sin(wavePhase) * WAVE_AMPLITUDE;
      const waveY = Math.cos(wavePhase * 1.3) * WAVE_AMPLITUDE;

      const cx = shape.baseX + waveX;
      const cy = shape.baseY + waveY;
      const r = shape.size;

      // Y culling
      if (cy + r < bounds.top || cy - r > bounds.bottom) continue;

      // X culling with horizontal wrapping
      const renderCx = getWrappedX(cx, r, bounds.left, bounds.right);
      if (renderCx === null) continue;

      // Get template and compute color
      const template = shapeTemplates[shape.shape];
      const hue = shape.baseHue + this.hueOffset;
      const rgb = hslToRgb(hue, 0.8, 0.55);

      // Fill using template
      draw.fillStyle = [rgb[0], rgb[1], rgb[2], 0.7];
      draw.fillTemplate(
        template.vertices,
        template.indices,
        renderCx,
        cy,
        shape.size,
        shape.rotation
      );
    }
  }

  get isLoaded(): boolean {
    return this.shapesLoaded;
  }
}
