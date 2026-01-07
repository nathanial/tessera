import { TILE_SIZE } from "./constants";

export interface ViewMetrics {
  worldSizeInPixels: number;
  viewWidth: number;
  viewHeight: number;
}

export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function getWorldSizeInPixels(zoom: number): number {
  return TILE_SIZE * Math.pow(2, zoom);
}

export function getViewMetrics(
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): ViewMetrics {
  const worldSizeInPixels = getWorldSizeInPixels(zoom);
  return {
    worldSizeInPixels,
    viewWidth: viewportWidth / worldSizeInPixels,
    viewHeight: viewportHeight / worldSizeInPixels,
  };
}

export function getViewBounds(
  centerX: number,
  centerY: number,
  viewWidth: number,
  viewHeight: number
): ViewBounds {
  return {
    left: centerX - viewWidth / 2,
    right: centerX + viewWidth / 2,
    top: centerY - viewHeight / 2,
    bottom: centerY + viewHeight / 2,
  };
}
