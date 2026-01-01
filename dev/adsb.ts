/**
 * ADS-B Aircraft Tracking Layer
 *
 * Fetches real-time aircraft positions from the OpenSky Network API
 * and converts them to Tessera coordinates for rendering.
 */

import { lonLatToTessera } from "../src/index";

const OPENSKY_API = "https://opensky-network.org/api/states/all";

// CORS proxy for production (OpenSky doesn't allow cross-origin requests)
const CORS_PROXY = "https://corsproxy.io/?";

function getApiUrl(): string {
  // Use proxy in production (when not on localhost)
  const isLocalhost = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  return isLocalhost ? OPENSKY_API : CORS_PROXY + encodeURIComponent(OPENSKY_API);
}

export interface Aircraft {
  icao24: string;
  callsign: string | null;
  x: number; // Tessera coordinate (0-1)
  y: number; // Tessera coordinate (0-1)
  altitude: number; // meters (barometric)
  heading: number; // radians (0 = north, clockwise)
  velocity: number; // m/s
  onGround: boolean;
}

export class ADSBLayer {
  aircraft: Aircraft[] = [];
  lastFetchTime: number = 0;
  isFetching: boolean = false;

  /**
   * Fetch aircraft data from OpenSky Network.
   * Returns immediately if already fetching or if called too soon.
   */
  async fetch(): Promise<void> {
    if (this.isFetching) return;

    this.isFetching = true;
    try {
      const response = await fetch(getApiUrl());
      if (!response.ok) {
        console.warn(`[ADSB] API error: ${response.status}`);
        return;
      }

      const data = await response.json();
      this.update(data.states || []);
      this.lastFetchTime = Date.now();
      console.log(`[ADSB] Fetched ${this.aircraft.length} aircraft`);
    } catch (err) {
      console.warn("[ADSB] Fetch failed:", err);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Parse OpenSky state vectors and convert to Aircraft objects.
   *
   * State vector indices:
   * 0: icao24, 1: callsign, 5: longitude, 6: latitude,
   * 7: baro_altitude, 8: on_ground, 9: velocity, 10: true_track
   */
  private update(states: unknown[][]): void {
    this.aircraft = [];

    for (const state of states) {
      const lon = state[5] as number | null;
      const lat = state[6] as number | null;

      // Skip aircraft without position data
      if (lon === null || lat === null) continue;

      const { x, y } = lonLatToTessera(lon, lat);

      // Convert true_track from degrees to radians
      const trueTrack = state[10] as number | null;
      const heading = trueTrack !== null ? (trueTrack * Math.PI) / 180 : 0;

      this.aircraft.push({
        icao24: state[0] as string,
        callsign: (state[1] as string | null)?.trim() || null,
        x,
        y,
        altitude: (state[7] as number | null) ?? 0,
        heading,
        velocity: (state[9] as number | null) ?? 0,
        onGround: state[8] as boolean,
      });
    }
  }
}

/**
 * Get color based on altitude.
 * Low altitude = green, medium = yellow, high = blue/purple
 */
export function getAltitudeColor(
  altitude: number,
  onGround: boolean
): [number, number, number, number] {
  if (onGround) {
    return [0.5, 0.5, 0.5, 0.8]; // Gray for ground
  }

  // Altitude in meters, typical cruise ~10000-12000m
  const normalized = Math.min(altitude / 12000, 1);

  if (normalized < 0.33) {
    // Low: green to yellow
    const t = normalized / 0.33;
    return [t, 0.8, 0.2 * (1 - t), 0.9];
  } else if (normalized < 0.66) {
    // Medium: yellow to orange
    const t = (normalized - 0.33) / 0.33;
    return [1, 0.8 - t * 0.4, 0, 0.9];
  } else {
    // High: orange to blue
    const t = (normalized - 0.66) / 0.34;
    return [1 - t * 0.7, 0.4 - t * 0.2, t * 0.9, 0.9];
  }
}
