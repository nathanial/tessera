/**
 * Aircraft rendering layer.
 * Handles aircraft template generation and rendering.
 */

import earcut from "earcut";
import type { DrawContext } from "../src/index";
import { ADSBLayer, getAltitudeColor, type CommandGroup } from "./adsb";
import { getWrappedX } from "./CoordinateUtils";
import type { SensorConeRenderer } from "./SensorConeRenderer";
import { SENSOR_CONE_UNIT_RADIUS } from "./SensorConeRenderer";

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

const SENSOR_CONE_WORLD_SIZE = 0.0003; // World units (0-1)
const SENSOR_CONE_COLOR: [number, number, number, number] = [0.6, 0.2, 0.9, 0.28];

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

  setSpeedMultiplier(multiplier: number): void {
    this.adsbLayer.setSpeedMultiplier(multiplier);
  }

  getSpeedMultiplier(): number {
    return this.adsbLayer.getSpeedMultiplier();
  }

  setDestinationForAircraft(ids: Set<string>, destX: number, destY: number): void {
    this.adsbLayer.setDestinationForAircraft(ids, destX, destY);
  }

  getCommandGroups(): CommandGroup[] {
    return this.adsbLayer.getCommandGroups();
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

  /** Render sensor cones for visible aircraft. */
  renderSensors(
    renderer: SensorConeRenderer,
    matrix: Float32Array,
    timeSeconds: number,
    speedMultiplier: number,
    bounds: { left: number; right: number; top: number; bottom: number },
    _aircraftSize: number
  ): number {
    let sensorsDrawn = 0;
    const coneSize = SENSOR_CONE_WORLD_SIZE;
    const coneRadius = coneSize * SENSOR_CONE_UNIT_RADIUS;
    renderer.begin(matrix, timeSeconds, speedMultiplier);

    for (const ac of this.adsbLayer.aircraft) {
      if (ac.y + coneRadius < bounds.top || ac.y - coneRadius > bounds.bottom) {
        continue;
      }

      const renderX = getWrappedX(ac.x, coneRadius, bounds.left, bounds.right);
      if (renderX === null) continue;

      const phaseSeed = parseInt(ac.icao24, 16);
      const phase = Number.isFinite(phaseSeed) ? (phaseSeed % 997) / 997 : 0;
      renderer.addCone(renderX, ac.y, coneSize, ac.heading, phase, SENSOR_CONE_COLOR);
      sensorsDrawn++;
    }

    renderer.render();
    return sensorsDrawn;
  }

  /** Get aircraft array for label processing. */
  get aircraft() {
    return this.adsbLayer.aircraft;
  }
}

// Export vertices/indices for external use
export { aircraftVertices, aircraftIndices };
