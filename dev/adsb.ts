/**
 * ADS-B Aircraft Tracking Layer (Simulated)
 *
 * Generates synthetic aircraft data with realistic flight corridors.
 * Aircraft fly between major airports following established routes.
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

// Airport definition
interface Airport {
  code: string;
  name: string;
  lon: number;
  lat: number;
  hub: boolean; // Major hub = more traffic
}

// Major world airports
const AIRPORTS: Airport[] = [
  // North America
  { code: "JFK", name: "New York JFK", lon: -73.78, lat: 40.64, hub: true },
  { code: "LAX", name: "Los Angeles", lon: -118.41, lat: 33.94, hub: true },
  { code: "ORD", name: "Chicago O'Hare", lon: -87.90, lat: 41.98, hub: true },
  { code: "DFW", name: "Dallas/Fort Worth", lon: -97.04, lat: 32.90, hub: true },
  { code: "DEN", name: "Denver", lon: -104.67, lat: 39.86, hub: true },
  { code: "ATL", name: "Atlanta", lon: -84.43, lat: 33.64, hub: true },
  { code: "SFO", name: "San Francisco", lon: -122.38, lat: 37.62, hub: true },
  { code: "SEA", name: "Seattle", lon: -122.31, lat: 47.45, hub: false },
  { code: "MIA", name: "Miami", lon: -80.29, lat: 25.79, hub: true },
  { code: "BOS", name: "Boston", lon: -71.01, lat: 42.36, hub: false },
  { code: "YYZ", name: "Toronto", lon: -79.63, lat: 43.68, hub: true },
  { code: "YVR", name: "Vancouver", lon: -123.18, lat: 49.19, hub: false },
  { code: "MEX", name: "Mexico City", lon: -99.07, lat: 19.44, hub: true },

  // Europe
  { code: "LHR", name: "London Heathrow", lon: -0.46, lat: 51.47, hub: true },
  { code: "CDG", name: "Paris CDG", lon: 2.55, lat: 49.01, hub: true },
  { code: "FRA", name: "Frankfurt", lon: 8.57, lat: 50.03, hub: true },
  { code: "AMS", name: "Amsterdam", lon: 4.76, lat: 52.31, hub: true },
  { code: "MAD", name: "Madrid", lon: -3.57, lat: 40.47, hub: true },
  { code: "FCO", name: "Rome", lon: 12.25, lat: 41.80, hub: false },
  { code: "MUC", name: "Munich", lon: 11.79, lat: 48.35, hub: false },
  { code: "ZRH", name: "Zurich", lon: 8.56, lat: 47.46, hub: false },
  { code: "IST", name: "Istanbul", lon: 28.81, lat: 41.26, hub: true },

  // Asia
  { code: "HND", name: "Tokyo Haneda", lon: 139.78, lat: 35.55, hub: true },
  { code: "NRT", name: "Tokyo Narita", lon: 140.39, lat: 35.77, hub: true },
  { code: "PEK", name: "Beijing", lon: 116.60, lat: 40.08, hub: true },
  { code: "PVG", name: "Shanghai", lon: 121.81, lat: 31.14, hub: true },
  { code: "HKG", name: "Hong Kong", lon: 113.91, lat: 22.31, hub: true },
  { code: "SIN", name: "Singapore", lon: 103.99, lat: 1.36, hub: true },
  { code: "ICN", name: "Seoul Incheon", lon: 126.45, lat: 37.46, hub: true },
  { code: "BKK", name: "Bangkok", lon: 100.75, lat: 13.69, hub: true },
  { code: "DEL", name: "Delhi", lon: 77.10, lat: 28.56, hub: true },
  { code: "DXB", name: "Dubai", lon: 55.36, lat: 25.25, hub: true },
  { code: "DOH", name: "Doha", lon: 51.61, lat: 25.26, hub: true },

  // Oceania
  { code: "SYD", name: "Sydney", lon: 151.18, lat: -33.95, hub: true },
  { code: "MEL", name: "Melbourne", lon: 144.84, lat: -37.67, hub: false },
  { code: "AKL", name: "Auckland", lon: 174.79, lat: -37.01, hub: false },

  // South America
  { code: "GRU", name: "Sao Paulo", lon: -46.47, lat: -23.43, hub: true },
  { code: "EZE", name: "Buenos Aires", lon: -58.54, lat: -34.82, hub: false },
  { code: "BOG", name: "Bogota", lon: -74.15, lat: 4.70, hub: false },
  { code: "SCL", name: "Santiago", lon: -70.79, lat: -33.39, hub: false },
  { code: "LIM", name: "Lima", lon: -77.11, lat: -12.02, hub: false },

  // Africa
  { code: "JNB", name: "Johannesburg", lon: 28.23, lat: -26.14, hub: true },
  { code: "CAI", name: "Cairo", lon: 31.41, lat: 30.11, hub: true },
  { code: "CPT", name: "Cape Town", lon: 18.60, lat: -33.97, hub: false },
  { code: "NBO", name: "Nairobi", lon: 36.93, lat: -1.32, hub: false },
];

// Airline prefixes by region
const AIRLINES: Record<string, string[]> = {
  NA: ["AAL", "UAL", "DAL", "SWA", "JBU", "ASA", "ACA", "WJA"],
  EU: ["BAW", "AFR", "DLH", "KLM", "IBE", "SAS", "AZA", "TAP", "SWR"],
  AS: ["CCA", "CES", "CSN", "ANA", "JAL", "KAL", "SIA", "THA", "CPA"],
  ME: ["UAE", "ETD", "QTR", "THY", "MEA"],
  OC: ["QFA", "ANZ", "VOZ"],
  SA: ["AVA", "GOL", "LAN", "ARG"],
  AF: ["SAA", "ETH", "MSR"],
  CARGO: ["FDX", "UPS", "GTI", "CLX"],
};

// Internal aircraft state for simulation
interface SimulatedAircraft extends Aircraft {
  lon: number;
  lat: number;
  origin: Airport;
  destination: Airport;
  progress: number; // 0-1 along route
  cruiseAltitude: number;
}

/**
 * Calculate heading from one point to another
 */
function calculateHeading(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number
): number {
  // Handle longitude wrapping (take shortest path)
  let dLonDeg = toLon - fromLon;
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;

  const dLon = (dLonDeg * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let heading = Math.atan2(y, x);
  if (heading < 0) heading += 2 * Math.PI;
  return heading;
}

/**
 * Calculate distance between two points in meters
 */
function calculateDistance(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Interpolate position along a great circle route
 */
function interpolatePosition(
  origin: Airport,
  destination: Airport,
  progress: number
): { lon: number; lat: number } {
  // Simple linear interpolation (good enough for visualization)
  // Handle longitude wrapping for trans-Pacific routes
  let dLon = destination.lon - origin.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;

  let lon = origin.lon + dLon * progress;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  const lat = origin.lat + (destination.lat - origin.lat) * progress;
  return { lon, lat };
}

/**
 * Generate a random hex string (ICAO24 format)
 */
function randomIcao24(): string {
  return Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
}

/**
 * Get airline prefix based on route
 */
function getAirlineForRoute(origin: Airport, destination: Airport): string {
  // Determine region based on airports
  const getRegion = (apt: Airport): string => {
    if (apt.lon > -140 && apt.lon < -50 && apt.lat > 10 && apt.lat < 75) return "NA";
    if (apt.lon > -15 && apt.lon < 40 && apt.lat > 35 && apt.lat < 70) return "EU";
    if (apt.lon > 40 && apt.lon < 65 && apt.lat > 10 && apt.lat < 45) return "ME";
    if (apt.lon > 65 && apt.lon < 180 && apt.lat > -10 && apt.lat < 60) return "AS";
    if (apt.lon > 100 && apt.lat < -10) return "OC";
    if (apt.lon > -90 && apt.lon < -30 && apt.lat < 15) return "SA";
    if (apt.lon > -20 && apt.lon < 55 && apt.lat < 35 && apt.lat > -40) return "AF";
    return "NA"; // Default
  };

  // Prefer airline from origin region, sometimes use cargo
  const region = Math.random() > 0.1 ? getRegion(origin) : "CARGO";
  const airlines = AIRLINES[region] || AIRLINES["NA"]!;
  return airlines[Math.floor(Math.random() * airlines.length)]!;
}

/**
 * Generate callsign for a route
 */
function generateCallsign(origin: Airport, destination: Airport): string {
  const airline = getAirlineForRoute(origin, destination);
  const flight = Math.floor(Math.random() * 9000) + 100;
  return `${airline}${flight}`;
}

/**
 * Pick a random destination from an origin (weighted by hub status and distance)
 */
function pickDestination(origin: Airport): Airport {
  // Filter out the origin
  const candidates = AIRPORTS.filter((a) => a.code !== origin.code);

  // Weight by hub status and prefer medium-distance routes
  const weights = candidates.map((apt) => {
    let weight = apt.hub ? 3 : 1;

    // Calculate distance
    const dist = calculateDistance(origin.lon, origin.lat, apt.lon, apt.lat);
    const distKm = dist / 1000;

    // Prefer routes 500-5000km, still allow longer/shorter
    if (distKm > 500 && distKm < 5000) {
      weight *= 2;
    } else if (distKm > 5000 && distKm < 12000) {
      weight *= 1.5; // Long haul
    }

    return weight;
  });

  // Weighted random selection
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i]!;
  }

  return candidates[0]!;
}

/**
 * Calculate altitude based on flight progress (climb, cruise, descend)
 */
function calculateFlightAltitude(progress: number, cruiseAltitude: number): number {
  // Climb during first 15%, cruise in middle, descend in last 15%
  if (progress < 0.15) {
    // Climbing
    return (progress / 0.15) * cruiseAltitude;
  } else if (progress > 0.85) {
    // Descending
    return ((1 - progress) / 0.15) * cruiseAltitude;
  } else {
    // Cruising
    return cruiseAltitude;
  }
}

export class ADSBLayer {
  aircraft: Aircraft[] = [];
  private simAircraft: SimulatedAircraft[] = [];
  private lastUpdateTime: number = 0;

  constructor(private aircraftCount: number = 500) {
    this.generateAircraft();
  }

  /**
   * Generate initial set of simulated aircraft on routes
   */
  private generateAircraft(): void {
    this.simAircraft = [];

    // Pre-calculate hub airports for spawning
    const hubs = AIRPORTS.filter((a) => a.hub);

    for (let i = 0; i < this.aircraftCount; i++) {
      // Pick origin (weighted toward hubs)
      const origin =
        Math.random() > 0.3
          ? hubs[Math.floor(Math.random() * hubs.length)]!
          : AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)]!;

      // Pick destination
      const destination = pickDestination(origin);

      // Random progress along route (spread aircraft out)
      const progress = Math.random();

      // Calculate position
      const pos = interpolatePosition(origin, destination, progress);
      const { x, y } = lonLatToTessera(pos.lon, pos.lat);

      // Calculate heading toward destination
      const heading = calculateHeading(
        pos.lon,
        pos.lat,
        destination.lon,
        destination.lat
      );

      // Cruise altitude (varies by route length)
      const distance = calculateDistance(
        origin.lon,
        origin.lat,
        destination.lon,
        destination.lat
      );
      const cruiseAltitude =
        distance > 3000000
          ? 10000 + Math.random() * 2000 // Long haul: 10-12km
          : 8000 + Math.random() * 2000; // Short haul: 8-10km

      // Current altitude based on flight phase
      const altitude = calculateFlightAltitude(progress, cruiseAltitude);

      // Velocity (exaggerated 20x for visual effect)
      const velocity = (5000 + Math.random() * 3000) * 20; // 100000-160000 m/s

      this.simAircraft.push({
        icao24: randomIcao24(),
        callsign: Math.random() > 0.05 ? generateCallsign(origin, destination) : null,
        x,
        y,
        lon: pos.lon,
        lat: pos.lat,
        altitude,
        heading,
        velocity,
        onGround: false,
        origin,
        destination,
        progress,
        cruiseAltitude,
      });
    }

    this.updatePublicList();
    this.lastUpdateTime = performance.now();
    console.log(`[ADSB] Generated ${this.aircraftCount} aircraft on ${AIRPORTS.length} airport routes`);
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
      // Calculate route distance
      const routeDistance = calculateDistance(
        ac.origin.lon,
        ac.origin.lat,
        ac.destination.lon,
        ac.destination.lat
      );

      // Progress increment based on velocity
      const progressIncrement = (ac.velocity * dt) / routeDistance;
      ac.progress += progressIncrement;

      // Check if arrived at destination
      if (ac.progress >= 1) {
        // Start new flight from destination
        const newOrigin = ac.destination;
        const newDestination = pickDestination(newOrigin);

        ac.origin = newOrigin;
        ac.destination = newDestination;
        ac.progress = 0;
        ac.callsign = Math.random() > 0.05 ? generateCallsign(newOrigin, newDestination) : null;

        // New cruise altitude
        const distance = calculateDistance(
          newOrigin.lon,
          newOrigin.lat,
          newDestination.lon,
          newDestination.lat
        );
        ac.cruiseAltitude =
          distance > 3000000
            ? 10000 + Math.random() * 2000
            : 8000 + Math.random() * 2000;
      }

      // Update position along route
      const pos = interpolatePosition(ac.origin, ac.destination, ac.progress);
      ac.lon = pos.lon;
      ac.lat = pos.lat;

      // Update heading toward destination
      ac.heading = calculateHeading(
        ac.lon,
        ac.lat,
        ac.destination.lon,
        ac.destination.lat
      );

      // Update altitude based on flight phase
      ac.altitude = calculateFlightAltitude(ac.progress, ac.cruiseAltitude);

      // Update Tessera coordinates
      const { x, y } = lonLatToTessera(ac.lon, ac.lat);
      ac.x = x;
      ac.y = y;
    }

    this.updatePublicList();
  }

  /**
   * Compatibility method - regenerates aircraft
   */
  async fetch(): Promise<void> {
    this.generateAircraft();
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
