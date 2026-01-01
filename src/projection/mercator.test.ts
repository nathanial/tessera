/**
 * Mercator Projection Tests
 */

import { describe, it, expect } from "vitest";
import {
  lngLatToWorld,
  worldToLngLat,
  lngLatToWorldArray,
  clampLatitude,
  MAX_LATITUDE,
} from "./mercator";

describe("lngLatToWorld", () => {
  it("converts (0, 0) to (0.5, 0.5)", () => {
    const result = lngLatToWorld(0, 0);
    expect(result.x).toBeCloseTo(0.5, 10);
    expect(result.y).toBeCloseTo(0.5, 10);
  });

  it("converts (-180, 0) to (0, 0.5)", () => {
    const result = lngLatToWorld(-180, 0);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0.5, 10);
  });

  it("converts (180, 0) to (1, 0.5)", () => {
    const result = lngLatToWorld(180, 0);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0.5, 10);
  });

  it("converts San Francisco (-122.4194, 37.7749) to expected world coords", () => {
    const result = lngLatToWorld(-122.4194, 37.7749);
    // SF is in western hemisphere, so x < 0.5
    expect(result.x).toBeCloseTo(0.1599, 3);
    // SF is in northern hemisphere, so y < 0.5
    expect(result.y).toBeCloseTo(0.3862, 3);
  });

  it("handles extreme northern latitudes", () => {
    const result = lngLatToWorld(0, 85);
    expect(result.y).toBeGreaterThan(0);
    expect(result.y).toBeLessThan(0.1);
  });

  it("handles extreme southern latitudes", () => {
    const result = lngLatToWorld(0, -85);
    expect(result.y).toBeGreaterThan(0.9);
    expect(result.y).toBeLessThan(1);
  });

  it("clamps latitude beyond MAX_LATITUDE", () => {
    const result = lngLatToWorld(0, 90);
    const maxResult = lngLatToWorld(0, MAX_LATITUDE);
    expect(result.y).toBeCloseTo(maxResult.y, 10);
  });
});

describe("worldToLngLat", () => {
  it("converts (0.5, 0.5) to (0, 0)", () => {
    const result = worldToLngLat(0.5, 0.5);
    expect(result.lng).toBeCloseTo(0, 10);
    expect(result.lat).toBeCloseTo(0, 10);
  });

  it("converts (0, 0.5) to (-180, 0)", () => {
    const result = worldToLngLat(0, 0.5);
    expect(result.lng).toBeCloseTo(-180, 10);
    expect(result.lat).toBeCloseTo(0, 10);
  });

  it("converts (1, 0.5) to (180, 0)", () => {
    const result = worldToLngLat(1, 0.5);
    expect(result.lng).toBeCloseTo(180, 10);
    expect(result.lat).toBeCloseTo(0, 10);
  });

  it("is inverse of lngLatToWorld", () => {
    const testCases = [
      { lng: 0, lat: 0 },
      { lng: -122.4194, lat: 37.7749 }, // San Francisco
      { lng: 139.6917, lat: 35.6895 }, // Tokyo
      { lng: -73.9857, lat: 40.7484 }, // New York
      { lng: 2.3522, lat: 48.8566 }, // Paris
      { lng: 151.2093, lat: -33.8688 }, // Sydney
    ];

    for (const { lng, lat } of testCases) {
      const world = lngLatToWorld(lng, lat);
      const result = worldToLngLat(world.x, world.y);
      expect(result.lng).toBeCloseTo(lng, 6);
      expect(result.lat).toBeCloseTo(lat, 6);
    }
  });
});

describe("lngLatToWorldArray", () => {
  it("returns [x, y] tuple", () => {
    const result = lngLatToWorldArray(0, 0);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.5, 10);
    expect(result[1]).toBeCloseTo(0.5, 10);
  });
});

describe("clampLatitude", () => {
  it("returns value unchanged when within range", () => {
    expect(clampLatitude(0)).toBe(0);
    expect(clampLatitude(45)).toBe(45);
    expect(clampLatitude(-45)).toBe(-45);
  });

  it("clamps values above MAX_LATITUDE", () => {
    expect(clampLatitude(90)).toBeCloseTo(MAX_LATITUDE, 10);
    expect(clampLatitude(100)).toBeCloseTo(MAX_LATITUDE, 10);
  });

  it("clamps values below -MAX_LATITUDE", () => {
    expect(clampLatitude(-90)).toBeCloseTo(-MAX_LATITUDE, 10);
    expect(clampLatitude(-100)).toBeCloseTo(-MAX_LATITUDE, 10);
  });
});

describe("MAX_LATITUDE", () => {
  it("is approximately 85.05 degrees", () => {
    expect(MAX_LATITUDE).toBeCloseTo(85.051, 3);
  });
});
