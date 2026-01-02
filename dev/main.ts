/**
 * Tessera demo application entry point.
 * Renders aircraft, US state border shapes, and labels.
 */

import { Tessera, VERSION, lonLatToTessera, SDFRenderer, createFontAtlas, TextLayout } from "../src/index";
import { setupCameraControls, updateZoomState } from "./CameraController";
import { BorderRenderer } from "./BorderRenderer";
import { AircraftRenderer } from "./AircraftRenderer";
import { LabelRenderer } from "./LabelRenderer";
import { renderDebugGrid, renderStatsOverlay } from "./UIController";

console.log(`Tessera v${VERSION}`);

// ============================================
// INITIALIZATION
// ============================================

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create immediate mode draw context
const draw = tessera.createDrawContext();

// Create SDF text renderer for aircraft labels
const sdfRenderer = new SDFRenderer(tessera.gl);

// Create renderers
const borderRenderer = new BorderRenderer();
const aircraftRenderer = new AircraftRenderer(10000); // 10k simulated aircraft
const labelRenderer = new LabelRenderer();

const labelToggleButton = document.getElementById("toggle-labels") as HTMLButtonElement | null;
let showLabels = true;
if (labelToggleButton) {
  labelToggleButton.addEventListener("click", () => {
    showLabels = !showLabels;
    labelToggleButton.textContent = showLabels ? "Labels: On" : "Labels: Off";
  });
}

const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".speed-button"));
if (speedButtons.length > 0) {
  const setActiveSpeed = (value: number) => {
    aircraftRenderer.setSpeedMultiplier(value);
    for (const button of speedButtons) {
      const buttonValue = Number(button.dataset.speed);
      button.classList.toggle("active", buttonValue === value);
    }
  };

  for (const button of speedButtons) {
    button.addEventListener("click", () => {
      const value = Number(button.dataset.speed);
      if (!Number.isFinite(value)) return;
      setActiveSpeed(value);
    });
  }

  const initialSpeedButton = speedButtons.find((button) => button.classList.contains("active"));
  const initialSpeed = initialSpeedButton ? Number(initialSpeedButton.dataset.speed) : 0.1;
  if (Number.isFinite(initialSpeed)) {
    setActiveSpeed(initialSpeed);
  }
}

// Load font atlas
const fontAtlas = createFontAtlas({
  fontFamily: "Arial, sans-serif",
  fontSize: 32,
  atlasSize: 512,
});

fontAtlas.ready.then(() => {
  sdfRenderer.loadFontAtlas(fontAtlas.metadata, fontAtlas.image);

  // Create TextLayout for accurate text measurement
  const textLayout = new TextLayout(fontAtlas.metadata);
  labelRenderer.setMeasureFunction((text, fontSize) => textLayout.measureLine(text, fontSize));

  console.log("Font atlas loaded for aircraft labels");
});

// Setup camera controls
const controlState = setupCameraControls(tessera, canvas);

// Start centered on the US
const usCenter = lonLatToTessera(-98, 39); // Central US (Kansas)
tessera.camera.centerX = usCenter.x;
tessera.camera.centerY = usCenter.y;
tessera.camera.zoom = 8;

// ============================================
// MAIN RENDER LOOP
// ============================================

let lastTime = performance.now();

const originalRender = tessera.render.bind(tessera);

tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update zoom animation
  updateZoomState(tessera, controlState, dt);

  // Update animations
  borderRenderer.update(dt);
  aircraftRenderer.update();

  // Render tiles first
  originalRender();

  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  const w = this.canvas.width;
  const h = this.canvas.height;
  const bounds = this.camera.getVisibleBounds(w, h);

  // ============================================
  // RENDER ALL LAYERS
  // ============================================

  draw.begin(matrix, w, h);

  // Render border shapes
  borderRenderer.render(draw, bounds);

  // Calculate aircraft size based on zoom
  const viewWidth = bounds.right - bounds.left;
  const aircraftSize = aircraftRenderer.getAircraftSize(this.camera.zoom, viewWidth, w);

  // Render aircraft
  aircraftRenderer.render(draw, bounds, aircraftSize);

  draw.end();

  // ============================================
  // RENDER LABELS
  // ============================================

  sdfRenderer.clearText();
  if (showLabels) {
    labelRenderer.render(
      draw,
      sdfRenderer,
      aircraftRenderer,
      matrix,
      w,
      h,
      bounds,
      aircraftSize,
      this.camera.zoom,
      controlState.isZooming
    );
  }

  // ============================================
  // RENDER UI OVERLAYS
  // ============================================

  if (controlState.showDebugGrid) {
    renderDebugGrid(draw, matrix, w, h, labelRenderer.getClusterCellSize());
  }

  renderStatsOverlay(draw, sdfRenderer, matrix, w, h, this.camera.zoom);

  sdfRenderer.render(matrix, w, h);

  // Request next frame for continuous animation
  this.requestRender();
};

// Start render loop
tessera.start();

console.log("Shapes loaded along US state borders (count will appear when loaded)");
