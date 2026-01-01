/**
 * Geographic projection utilities
 *
 * Converts between WGS-84 lat/lon and Tessera's 0-1 coordinate system
 * which uses Web Mercator projection (compatible with standard web map tiles).
 */

/**
 * Convert longitude/latitude to Tessera coordinates (0-1 range).
 * Uses Web Mercator projection.
 *
 * @param lon Longitude in degrees (-180 to 180)
 * @param lat Latitude in degrees (-85.05 to 85.05 for valid Mercator)
 * @returns Tessera coordinates where (0,0) is top-left, (1,1) is bottom-right
 */
export function lonLatToTessera(
  lon: number,
  lat: number
): { x: number; y: number } {
  // Clamp latitude to valid Mercator range
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;

  // Web Mercator projection to 0-1 range
  const x = (lon + 180) / 360;
  const y =
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;

  return { x, y };
}

/**
 * Convert Tessera coordinates back to longitude/latitude.
 * Inverse of lonLatToTessera.
 *
 * @param x Tessera X coordinate (0-1)
 * @param y Tessera Y coordinate (0-1)
 * @returns Longitude and latitude in degrees
 */
export function tesseraToLonLat(
  x: number,
  y: number
): { lon: number; lat: number } {
  const lon = x * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
  const lat = (latRad * 180) / Math.PI;

  return { lon, lat };
}
