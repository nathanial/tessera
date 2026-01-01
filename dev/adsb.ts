/**
 * ADS-B Aircraft Tracking Layer (Simulated)
 *
 * Generates synthetic aircraft data for demo purposes.
 * Simulates realistic flight paths across the continental US.
 */

import { lonLatToTessera } from "../src/index";

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

// Internal aircraft state for simulation
interface SimulatedAircraft extends Aircraft {
  lon: number;
  lat: number;
  headingDeg: number; // degrees for easier math
}

// World bounding box (valid Mercator range)
const WORLD_BOUNDS = {
  minLon: -180,
  maxLon: 180,
  minLat: -60,  // Exclude Antarctica
  maxLat: 70,   // Exclude Arctic
};

// Airline prefixes for realistic callsigns (worldwide)
const AIRLINES = [
  // North America
  "AAL", "UAL", "DAL", "SWA", "JBU", "ASA", "ACA", "WJA",
  // Europe
  "BAW", "AFR", "DLH", "KLM", "IBE", "SAS", "AZA", "TAP", "SWR", "AUA",
  // Asia
  "CCA", "CES", "CSN", "ANA", "JAL", "KAL", "AAR", "SIA", "THA", "MAS",
  // Middle East
  "UAE", "ETD", "QTR", "SIA", "THY",
  // Oceania
  "QFA", "ANZ", "VOZ",
  // Cargo
  "FDX", "UPS", "GTI", "CLX",
];

/**
 * Generate a random hex string (ICAO24 format)
 */
function randomIcao24(): string {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

/**
 * Generate a random callsign
 */
function randomCallsign(): string {
  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)]!;
  const flight = Math.floor(Math.random() * 9000) + 100;
  return `${airline}${flight}`;
}

/**
 * Generate a random position within world bounds
 */
function randomPosition(): { lon: number; lat: number } {
  return {
    lon: WORLD_BOUNDS.minLon + Math.random() * (WORLD_BOUNDS.maxLon - WORLD_BOUNDS.minLon),
    lat: WORLD_BOUNDS.minLat + Math.random() * (WORLD_BOUNDS.maxLat - WORLD_BOUNDS.minLat),
  };
}

export class ADSBLayer {
  aircraft: Aircraft[] = [];
  private simAircraft: SimulatedAircraft[] = [];
  private lastUpdateTime: number = 0;

  constructor(private aircraftCount: number = 500) {
    this.generateAircraft();
  }

  /**
   * Generate initial set of simulated aircraft
   */
  private generateAircraft(): void {
    this.simAircraft = [];

    for (let i = 0; i < this.aircraftCount; i++) {
      const pos = randomPosition();
      const { x, y } = lonLatToTessera(pos.lon, pos.lat);

      // Random heading (0-360 degrees)
      const headingDeg = Math.random() * 360;
      const heading = (headingDeg * Math.PI) / 180;

      // Random altitude: mix of ground, low, cruising
      let altitude: number;
      let onGround = false;
      const altitudeClass = Math.random();
      if (altitudeClass < 0.05) {
        // 5% on ground
        altitude = 0;
        onGround = true;
      } else if (altitudeClass < 0.15) {
        // 10% low altitude (takeoff/landing)
        altitude = 500 + Math.random() * 2000;
      } else if (altitudeClass < 0.4) {
        // 25% medium altitude
        altitude = 3000 + Math.random() * 5000;
      } else {
        // 60% cruising altitude
        altitude = 9000 + Math.random() * 4000;
      }

      // Velocity based on altitude (exaggerated for visual effect)
      let velocity: number;
      if (onGround) {
        velocity = Math.random() * 500; // 0-500 m/s on ground
      } else if (altitude < 3000) {
        velocity = 2000 + Math.random() * 1500; // 2000-3500 m/s low alt
      } else {
        velocity = 5000 + Math.random() * 3000; // 5000-8000 m/s cruise
      }

      this.simAircraft.push({
        icao24: randomIcao24(),
        callsign: Math.random() > 0.1 ? randomCallsign() : null, // 10% no callsign
        x,
        y,
        lon: pos.lon,
        lat: pos.lat,
        altitude,
        heading,
        headingDeg,
        velocity,
        onGround,
      });
    }

    this.updatePublicList();
    this.lastUpdateTime = performance.now();
    console.log(`[ADSB] Generated ${this.aircraftCount} simulated aircraft`);
  }

  /**
   * Update public aircraft list from simulation state
   */
  private updatePublicList(): void {
    this.aircraft = this.simAircraft.map((ac) => ({
      icao24: ac.icao24,
      callsign: ac.callsign,
      x: ac.x,
      y: ac.y,
      altitude: ac.altitude,
      heading: ac.heading,
      velocity: ac.velocity,
      onGround: ac.onGround,
    }));
  }

  /**
   * Update aircraft positions based on elapsed time.
   * Call this each frame for smooth animation.
   */
  update(): void {
    const now = performance.now();
    const dt = (now - this.lastUpdateTime) / 1000; // seconds
    this.lastUpdateTime = now;

    // Skip if dt is too large (tab was backgrounded)
    if (dt > 1) return;

    for (const ac of this.simAircraft) {
      if (ac.onGround && ac.velocity < 5) continue; // Stationary

      // Convert velocity from m/s to degrees/second
      // At equator: 1 degree ≈ 111km, so 1 m/s ≈ 0.000009 deg/s
      // Adjust for latitude (longitude degrees get smaller toward poles)
      const metersPerDegLat = 111000;
      const metersPerDegLon = 111000 * Math.cos((ac.lat * Math.PI) / 180);

      // Heading: 0 = north, 90 = east, etc.
      const headingRad = (ac.headingDeg * Math.PI) / 180;
      const dLat = (ac.velocity * dt * Math.cos(headingRad)) / metersPerDegLat;
      const dLon = (ac.velocity * dt * Math.sin(headingRad)) / metersPerDegLon;

      ac.lat += dLat;
      ac.lon += dLon;

      // Slight heading drift for realism
      ac.headingDeg += (Math.random() - 0.5) * 2 * dt;
      ac.heading = (ac.headingDeg * Math.PI) / 180;

      // Wrap around longitude (world wraps horizontally)
      if (ac.lon < WORLD_BOUNDS.minLon) ac.lon += 360;
      if (ac.lon > WORLD_BOUNDS.maxLon) ac.lon -= 360;
      // Clamp latitude (can't wrap vertically)
      if (ac.lat < WORLD_BOUNDS.minLat) ac.lat = WORLD_BOUNDS.minLat;
      if (ac.lat > WORLD_BOUNDS.maxLat) ac.lat = WORLD_BOUNDS.maxLat;

      // Update Tessera coordinates
      const { x, y } = lonLatToTessera(ac.lon, ac.lat);
      ac.x = x;
      ac.y = y;
    }

    this.updatePublicList();
  }

  /**
   * Compatibility method - now just regenerates aircraft
   */
  async fetch(): Promise<void> {
    // No-op for simulated data (aircraft already generated)
    // Could regenerate if needed
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
