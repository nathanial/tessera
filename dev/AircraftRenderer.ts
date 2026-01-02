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
import type { TrailRenderer } from "./TrailRenderer";
import { wrapWorldXNear } from "./SelectionUtils";

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
const TRAIL_SAMPLE_DISTANCE = 0.00025;
const TRAIL_MAX_POINTS = 20;
const TRAIL_MAX_AGE = 8;
const TRAIL_STAMP_SIZE_MULTIPLIER = 0.45;

// ============================================
// AIRCRAFT RENDERER CLASS
// ============================================

export class AircraftRenderer {
  readonly adsbLayer: ADSBLayer;
  private trails: Array<Array<{ x: number; y: number; t: number }>> = [];
  private lastTrailSampleX: Float32Array = new Float32Array(0);
  private lastTrailSampleY: Float32Array = new Float32Array(0);
  private lastTrailSampleTime: Float32Array = new Float32Array(0);

  constructor(aircraftCount: number = 10000) {
    this.adsbLayer = new ADSBLayer(aircraftCount);
    this.ensureTrailBuffers();
  }

  private ensureTrailBuffers(): void {
    const count = this.adsbLayer.aircraft.length;
    if (this.trails.length === count) return;
    this.trails = Array.from({ length: count }, () => []);
    this.lastTrailSampleX = new Float32Array(count);
    this.lastTrailSampleY = new Float32Array(count);
    this.lastTrailSampleTime = new Float32Array(count);
    this.lastTrailSampleTime.fill(-1);
  }

  /** Update aircraft positions. Call once per frame. */
  update(): void {
    this.adsbLayer.update();
    this.ensureTrailBuffers();
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

  getTrailSampleDistance(_aircraftSize: number): number {
    return TRAIL_SAMPLE_DISTANCE;
  }

  getTrailStampSize(aircraftSize: number): number {
    return aircraftSize * TRAIL_STAMP_SIZE_MULTIPLIER;
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

  updateTrails(timeSeconds: number, sampleDistance: number): void {
    const count = this.adsbLayer.aircraft.length;
    if (count === 0) return;
    this.ensureTrailBuffers();

    for (let i = 0; i < count; i++) {
      const ac = this.adsbLayer.aircraft[i]!;
      const lastTime = this.lastTrailSampleTime[i]!;
      let sampleX = ac.x;
      let sampleY = ac.y;

      if (lastTime >= 0) {
        sampleX = wrapWorldXNear(ac.x, this.lastTrailSampleX[i]!);
        const dx = sampleX - this.lastTrailSampleX[i]!;
        const dy = sampleY - this.lastTrailSampleY[i]!;
        const dist = Math.hypot(dx, dy);
        if (dist < sampleDistance) {
          continue;
        }
      }

      this.trails[i]!.push({ x: sampleX, y: sampleY, t: timeSeconds });
      this.lastTrailSampleX[i] = sampleX;
      this.lastTrailSampleY[i] = sampleY;
      this.lastTrailSampleTime[i] = timeSeconds;

      const cutoff = timeSeconds - TRAIL_MAX_AGE;
      while (this.trails[i]!.length > 0 && this.trails[i]![0]!.t < cutoff) {
        this.trails[i]!.shift();
      }
      while (this.trails[i]!.length > TRAIL_MAX_POINTS) {
        this.trails[i]!.shift();
      }
    }
  }

  renderTrails(
    renderer: TrailRenderer,
    matrix: Float32Array,
    timeSeconds: number,
    bounds: { left: number; right: number; top: number; bottom: number },
    stampSize: number
  ): void {
    const count = this.adsbLayer.aircraft.length;
    if (count === 0) return;
    renderer.begin(matrix, timeSeconds, TRAIL_MAX_AGE);

    for (let i = 0; i < count; i++) {
      const ac = this.adsbLayer.aircraft[i]!;
      const renderX = getWrappedX(ac.x, 0, bounds.left, bounds.right);
      if (renderX === null) continue;
      const points = this.trails[i]!;
      if (points.length === 0) continue;

      const baseColor = getAltitudeColor(ac.altitude, ac.onGround);
      const trailColor: [number, number, number, number] = [
        baseColor[0],
        baseColor[1],
        baseColor[2],
        0.25,
      ];

      for (const point of points) {
        const x = wrapWorldXNear(point.x, renderX);
        if (point.y < bounds.top || point.y > bounds.bottom) continue;
        renderer.addStamp(x, point.y, stampSize, point.t, trailColor);
      }
    }

    renderer.render();
  }

  /** Get aircraft array for label processing. */
  get aircraft() {
    return this.adsbLayer.aircraft;
  }
}

// Export vertices/indices for external use
export { aircraftVertices, aircraftIndices };
