/**
 * Camera controls for mouse, keyboard, and touch input.
 */

import type { Tessera } from "../src/index";

export interface CameraControllerState {
  isZooming: boolean;
  showDebugGrid: boolean;
}

/**
 * Sets up camera controls for a Tessera instance.
 * Returns state object that can be read by other modules.
 */
export function setupCameraControls(
  tessera: Tessera,
  canvas: HTMLCanvasElement
): CameraControllerState {
  const state: CameraControllerState = {
    isZooming: false,
    showDebugGrid: false,
  };

  // Mouse drag state
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    canvas.style.cursor = "grab";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const dpr = window.devicePixelRatio || 1;
    tessera.camera.pan(dx * dpr, dy * dpr, canvas.width, canvas.height);
    tessera.requestRender();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const dpr = window.devicePixelRatio || 1;
    const delta = -e.deltaY * 0.002;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;

    tessera.camera.addZoomVelocity(delta, x, y, canvas.width, canvas.height);
    tessera.requestRender();
  });

  // Touch support
  let lastTouchDistance = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch0 = e.touches[0];
    const touch1 = e.touches[1];

    if (e.touches.length === 1 && touch0) {
      lastTouchX = touch0.clientX;
      lastTouchY = touch0.clientY;
    } else if (e.touches.length === 2 && touch0 && touch1) {
      const dx = touch1.clientX - touch0.clientX;
      const dy = touch1.clientY - touch0.clientY;
      lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      lastTouchX = (touch0.clientX + touch1.clientX) / 2;
      lastTouchY = (touch0.clientY + touch1.clientY) / 2;
    }
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch0 = e.touches[0];
    const touch1 = e.touches[1];

    const dpr = window.devicePixelRatio || 1;

    if (e.touches.length === 1 && touch0) {
      const dx = touch0.clientX - lastTouchX;
      const dy = touch0.clientY - lastTouchY;
      lastTouchX = touch0.clientX;
      lastTouchY = touch0.clientY;

      tessera.camera.pan(dx * dpr, dy * dpr, canvas.width, canvas.height);
      tessera.requestRender();
    } else if (e.touches.length === 2 && touch0 && touch1) {
      const dx = touch1.clientX - touch0.clientX;
      const dy = touch1.clientY - touch0.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const centerX = (touch0.clientX + touch1.clientX) / 2;
      const centerY = (touch0.clientY + touch1.clientY) / 2;

      if (lastTouchDistance > 0) {
        const delta = (distance - lastTouchDistance) * 0.01;
        const rect = canvas.getBoundingClientRect();
        const x = (centerX - rect.left) * dpr;
        const y = (centerY - rect.top) * dpr;
        tessera.camera.zoomAt(delta, x, y, canvas.width, canvas.height);
      }

      const panDx = centerX - lastTouchX;
      const panDy = centerY - lastTouchY;
      tessera.camera.pan(panDx * dpr, panDy * dpr, canvas.width, canvas.height);

      lastTouchDistance = distance;
      lastTouchX = centerX;
      lastTouchY = centerY;
      tessera.requestRender();
    }
  });

  canvas.style.cursor = "grab";

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    if (e.key === "g" || e.key === "G") {
      state.showDebugGrid = !state.showDebugGrid;
      console.log(`Debug grid: ${state.showDebugGrid ? "ON" : "OFF"}`);
      tessera.requestRender();
    }
  });

  console.log("Controls: drag to pan, shift+drag to select, scroll to zoom, G to toggle debug grid");

  return state;
}

/**
 * Update zoom animation state. Call this at the start of each frame.
 * Returns true if zoom is animating.
 */
export function updateZoomState(
  tessera: Tessera,
  state: CameraControllerState,
  dt: number
): boolean {
  const zoomAnimating = tessera.camera.updateZoom(dt);
  state.isZooming = zoomAnimating;
  if (zoomAnimating) {
    tessera.requestRender();
  }
  return zoomAnimating;
}
