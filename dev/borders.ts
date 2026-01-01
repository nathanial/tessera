/**
 * US State Border Point Extraction
 * Loads TopoJSON and samples points along state boundaries
 */

import * as topojson from "topojson-client";
import type { Topology, GeometryObject } from "topojson-specification";
import type { Feature, Geometry, Position } from "geojson";
import { lonLatToTessera } from "../src/index";

export interface BorderPoint {
  x: number;  // Tessera world coordinate
  y: number;
}

/**
 * Extract coordinate rings from a GeoJSON geometry
 */
function extractCoordinates(geometry: Geometry): Position[][] {
  const rings: Position[][] = [];

  if (geometry.type === "Polygon") {
    // Outer ring + holes
    for (const ring of geometry.coordinates) {
      rings.push(ring);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        rings.push(ring);
      }
    }
  }

  return rings;
}

/**
 * Sample points along a path at regular intervals
 */
function samplePointsAlongPath(
  path: Position[],
  spacing: number,
  output: BorderPoint[]
): void {
  let accumDist = 0;

  for (let i = 1; i < path.length; i++) {
    const [lon1, lat1] = path[i - 1]!;
    const [lon2, lat2] = path[i]!;

    // Convert to Tessera coordinates
    const p1 = lonLatToTessera(lon1!, lat1!);
    const p2 = lonLatToTessera(lon2!, lat2!);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    // Sample points along this segment
    while (accumDist < segLen) {
      const t = accumDist / segLen;
      output.push({
        x: p1.x + dx * t,
        y: p1.y + dy * t,
      });
      accumDist += spacing;
    }
    accumDist -= segLen;
  }
}

/**
 * Load US state borders and sample points along them
 * @param spacing - Distance between points in Tessera world units
 * @returns Array of border points
 */
// US States TopoJSON from CDN
const US_STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export async function loadStateBorderPoints(
  spacing: number = 0.0002
): Promise<BorderPoint[]> {
  // Fetch TopoJSON from CDN
  const response = await fetch(US_STATES_URL);
  const topology: Topology = await response.json();

  // Convert to GeoJSON FeatureCollection
  const statesObject = topology.objects["states"] as GeometryObject;
  const states = topojson.feature(topology, statesObject);

  // Extract all border line segments
  const points: BorderPoint[] = [];

  // Handle both single Feature and FeatureCollection
  const features: Feature[] =
    states.type === "FeatureCollection" ? states.features : [states as Feature];

  for (const feature of features) {
    const coords = extractCoordinates(feature.geometry as Geometry);
    for (const ring of coords) {
      samplePointsAlongPath(ring, spacing, points);
    }
  }

  console.log(`Loaded ${points.length} border points from ${features.length} states`);
  return points;
}
