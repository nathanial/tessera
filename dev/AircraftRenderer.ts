/**
 * Aircraft rendering layer.
 * Handles aircraft template generation and rendering.
 */

import earcut from "earcut";
import type { DrawContext } from "../src/index";
import { ADSBLayer, getAltitudeColor } from "./adsb";
import { getWrappedX } from "./CoordinateUtils";

// ============================================
// AIRCRAFT CONFIGURATION
// ============================================

const AIRCRAFT_SCREEN_SIZE = 15; // Size in pixels at full zoom
const AIRCRAFT_FULL_SIZE_ZOOM = 8; // Zoom level at which aircraft are full size
const AIRCRAFT_MIN_SIZE = 3; // Minimum size in pixels when zoomed out

// Aircraft triangle (pointing up, unit size)
const aircraftVertices = [
  0, -1,     // nose (top)
  -0.5, 0.8, // left wing
  0, 0.4,    // tail notch
  0.5, 0.8,  // right wing
];
const aircraftIndices = earcut(aircraftVertices);

// ============================================
// AIRCRAFT RENDERER CLASS
// ============================================

export class AircraftRenderer {
  readonly adsbLayer: ADSBLayer;

  constructor(aircraftCount: number = 10000) {
    this.adsbLayer = new ADSBLayer(aircraftCount);
  }

  /** Update aircraft positions. Call once per frame. */
  update(): void {
    this.adsbLayer.update();
  }

  /**
   * Calculate aircraft screen size based on zoom level.
   */
  getAircraftSize(
    zoom: number,
    viewWidth: number,
    viewportWidth: number
  ): number {
    const pixelsPerWorldUnit = viewportWidth / viewWidth;
    let aircraftScreenSize = AIRCRAFT_SCREEN_SIZE;

    if (zoom < AIRCRAFT_FULL_SIZE_ZOOM) {
      const t = (zoom - 4) / (AIRCRAFT_FULL_SIZE_ZOOM - 4);
      aircraftScreenSize = AIRCRAFT_MIN_SIZE + (AIRCRAFT_SCREEN_SIZE - AIRCRAFT_MIN_SIZE) * Math.max(0, t);
    }

    return aircraftScreenSize / pixelsPerWorldUnit;
  }

  /**
   * Render all visible aircraft.
   * Returns the number of aircraft drawn.
   */
  render(
    draw: DrawContext,
    bounds: { left: number; right: number; top: number; bottom: number },
    aircraftSize: number
  ): number {
    let aircraftDrawn = 0;

    for (const ac of this.adsbLayer.aircraft) {
      // Y culling
      if (ac.y + aircraftSize < bounds.top || ac.y - aircraftSize > bounds.bottom) {
        continue;
      }

      // X culling with horizontal wrapping
      const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
      if (renderX === null) continue;

      draw.fillStyle = getAltitudeColor(ac.altitude, ac.onGround);
      draw.fillTemplate(
        aircraftVertices,
        aircraftIndices,
        renderX,
        ac.y,
        aircraftSize,
        ac.heading
      );
      aircraftDrawn++;
    }

    return aircraftDrawn;
  }

  /** Get aircraft array for label processing. */
  get aircraft() {
    return this.adsbLayer.aircraft;
  }
}

// Export vertices/indices for external use
export { aircraftVertices, aircraftIndices };
