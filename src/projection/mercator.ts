/**
 * Web Mercator Projection
 *
 * Functions for converting between WGS84 (lng/lat) and normalized
 * Web Mercator world coordinates (0-1 range).
 */

import type { LngLat, WorldCoord } from "./types";

/** Degrees to radians conversion factor */
const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
const RAD_TO_DEG = 180 / Math.PI;

/** Maximum latitude for Web Mercator projection (~85.05 degrees) */
export const MAX_LATITUDE = 85.051128779806604;

/**
 * Clamp latitude to the valid Web Mercator range.
 *
 * @param lat - Latitude in degrees
 * @returns Clamped latitude between -MAX_LATITUDE and MAX_LATITUDE
 */
export function clampLatitude(lat: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
}

/**
 * Convert WGS84 coordinates to normalized Web Mercator (0-1 world space).
 *
 * The output coordinates are in the range [0, 1] where:
 * - x=0 is 180°W, x=1 is 180°E, x=0.5 is the prime meridian
 * - y=0 is ~85°N, y=1 is ~85°S, y=0.5 is the equator
 *
 * @param lng - Longitude in degrees (-180 to 180)
 * @param lat - Latitude in degrees (~-85.05 to ~85.05)
 * @returns World coordinates in 0-1 range
 */
export function lngLatToWorld(lng: number, lat: number): WorldCoord {
  const x = (lng + 180) / 360;
  const latRad = clampLatitude(lat) * DEG_TO_RAD;
  const y =
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return { x, y };
}

/**
 * Convert normalized Web Mercator coordinates back to WGS84.
 *
 * @param x - World X coordinate (0-1)
 * @param y - World Y coordinate (0-1)
 * @returns WGS84 longitude and latitude in degrees
 */
export function worldToLngLat(x: number, y: number): LngLat {
  const lng = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = RAD_TO_DEG * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

/**
 * Convert WGS84 coordinates to world coordinates as a tuple.
 * Convenience function for array-based coordinate handling.
 *
 * @param lng - Longitude in degrees
 * @param lat - Latitude in degrees
 * @returns [x, y] world coordinates in 0-1 range
 */
export function lngLatToWorldArray(lng: number, lat: number): [number, number] {
  const { x, y } = lngLatToWorld(lng, lat);
  return [x, y];
}
