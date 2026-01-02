/**
 * Type definitions for label placement system.
 */

import type { BoundingBox } from "./SpatialGrid";

export interface LabelItem {
  id: string;
  text: string;
  anchorX: number;  // World X position of anchor (e.g., aircraft)
  anchorY: number;  // World Y position
  priority?: number; // Higher = more important (placed first)
}

export interface PlacedLabel {
  item: LabelItem;
  screenX: number;      // Screen position of label
  screenY: number;
  anchorScreenX: number; // Screen position of anchor
  anchorScreenY: number;
  needsLeaderLine: boolean;
  bounds: BoundingBox;
}

export interface StackedCallout {
  items: LabelItem[];
  boxX: number;         // Screen position of callout box
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  centroidX: number;    // Screen position of cluster centroid (for branching tree)
  centroidY: number;
  aircraftPoints: Array<{ screenX: number; screenY: number }>;  // All aircraft positions for branching lines
  hiddenCount: number;  // Count of labels represented by +N more
}

export interface PlacementResult {
  directLabels: PlacedLabel[];       // Labels placed without leader lines
  leaderLabels: PlacedLabel[];       // Labels with leader lines
  callouts: StackedCallout[];        // Stacked callouts for dense areas
  hiddenCount: number;               // Labels not represented on screen
  hiddenIndicator?: PlacedLabel;     // Optional on-screen indicator for hidden labels
}

export interface PlacementOptions {
  fontSize: number;
  charWidth: number;          // Width per character as fraction of fontSize
  lineHeight: number;         // Line height as fraction of fontSize
  padding: number;            // Padding around labels in pixels
  calloutThreshold: number;   // Number of overlapping labels before using callout
  calloutReleaseThreshold: number; // Cluster size below which callout can dissolve
  maxCalloutLabels: number;   // Max labels shown in callout before "+N more"
  leaderLineMargin: number;   // Min distance to displace label
  hysteresisMargin: number;   // Pixels - must move this far past boundary to switch clusters
}

export const DEFAULT_OPTIONS: PlacementOptions = {
  fontSize: 14,
  charWidth: 0.55,
  lineHeight: 1.2,
  padding: 4,
  calloutThreshold: 4,
  calloutReleaseThreshold: 3,
  maxCalloutLabels: 5,
  leaderLineMargin: 30,
  hysteresisMargin: 20,
};

/** Function to measure text width */
export type TextMeasureFn = (text: string, fontSize: number) => number;

/** Cached callout position for hysteresis (stores offset from centroid, not absolute position) */
export interface CachedCallout {
  boxOffsetX: number;  // Box position relative to centroid
  boxOffsetY: number;
  boxWidth: number;
  boxHeight: number;
  centroidOffsetX?: number; // Centroid offset relative to cluster cell center
  centroidOffsetY?: number;
}

/** Tracks placement decision for each label for frame-to-frame stability */
export interface CachedPlacement {
  type: 'direct' | 'leader' | 'callout' | 'hidden';
  candidateIndex?: number;  // Which candidate position was used for leader labels
}

/** Standard offsets for leader line placement (indexed for caching) */
export const LEADER_OFFSETS = [
  // Right positions (preferred)
  { x: 1, y: 0 },       // 0: right
  { x: 1, y: -1 },      // 1: right-up
  { x: 1, y: 1 },       // 2: right-down
  // Left positions
  { x: -1, y: 0 },      // 3: left
  { x: -1, y: -1 },     // 4: left-up
  { x: -1, y: 1 },      // 5: left-down
  // Above/below
  { x: 0, y: -1 },      // 6: above
  { x: 0, y: 1 },       // 7: below
  // Further out
  { x: 2, y: 0 },       // 8: far right
  { x: 2, y: -2 },      // 9: far right-up
  { x: 2, y: 2 },       // 10: far right-down
];
