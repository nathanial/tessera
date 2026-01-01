import { Tessera, FeatureRenderer, VERSION } from "../src/index";

console.log(`Tessera v${VERSION}`);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create feature renderer for GeoJSON overlay
const featureRenderer = new FeatureRenderer(tessera.gl);

/**
 * Convert WGS84 coordinates to Web Mercator (0-1 world space)
 */
function lngLatToWorld(lng: number, lat: number): [number, number] {
  const x = (lng + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return [x, y];
}

/**
 * Convert a GeoJSON coordinate array from WGS84 to world space
 */
function convertCoords(coords: number[][]): number[][] {
  return coords.map(([lng, lat]) => lngLatToWorld(lng!, lat!));
}

// Sample polygon: San Francisco downtown area
const sfPolygon = {
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.42, 37.79],
      [-122.40, 37.79],
      [-122.40, 37.77],
      [-122.42, 37.77],
      [-122.42, 37.79],
    ]),
  ],
};

featureRenderer.addFeature(sfPolygon, {
  fillColor: [0.2, 0.6, 0.9, 0.4],
  strokeColor: [0.1, 0.3, 0.6, 1.0],
  strokeWidth: 3,
  strokeCap: "round",
});

// Sample line: A route through SF
const routeLine = {
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.43, 37.78],
    [-122.42, 37.785],
    [-122.41, 37.78],
    [-122.40, 37.785],
    [-122.39, 37.78],
  ]),
};

featureRenderer.addFeature(routeLine, {
  strokeColor: [0.9, 0.2, 0.2, 1.0],
  strokeWidth: 5,
  strokeCap: "round",
});

// Second polygon with hole: Golden Gate Park area
const parkPolygon = {
  type: "Polygon" as const,
  coordinates: [
    // Outer ring
    convertCoords([
      [-122.51, 37.77],
      [-122.45, 37.77],
      [-122.45, 37.765],
      [-122.51, 37.765],
      [-122.51, 37.77],
    ]),
    // Inner hole
    convertCoords([
      [-122.49, 37.768],
      [-122.47, 37.768],
      [-122.47, 37.767],
      [-122.49, 37.767],
      [-122.49, 37.768],
    ]),
  ],
};

featureRenderer.addFeature(parkPolygon, {
  fillColor: [0.2, 0.7, 0.3, 0.5],
  strokeColor: [0.1, 0.4, 0.2, 1.0],
  strokeWidth: 2,
  strokeCap: "butt",
});

console.log(`Added ${featureRenderer.featureCount} GeoJSON features`);

// Start centered on San Francisco area
tessera.camera.centerX = 0.17;
tessera.camera.centerY = 0.395;
tessera.camera.zoom = 12;

// Override render to include features
const originalRender = tessera.render.bind(tessera);
tessera.render = function () {
  originalRender();

  // Render features on top of tiles
  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  featureRenderer.render(matrix, this.canvas.width, this.canvas.height);
};

// Start render loop
tessera.start();

// Mouse drag to pan
let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("mousedown", (e) => {
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

  // Scale mouse delta by DPR to match device pixel coordinate system
  const dpr = window.devicePixelRatio || 1;
  tessera.camera.pan(dx * dpr, dy * dpr, canvas.width, canvas.height);
  tessera.requestRender();
});

// Mouse wheel to zoom
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const dpr = window.devicePixelRatio || 1;
  const delta = -e.deltaY * 0.002;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * dpr;
  const y = (e.clientY - rect.top) * dpr;

  tessera.camera.zoomAt(delta, x, y, canvas.width, canvas.height);
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

    // Zoom
    if (lastTouchDistance > 0) {
      const delta = (distance - lastTouchDistance) * 0.01;
      const rect = canvas.getBoundingClientRect();
      const x = (centerX - rect.left) * dpr;
      const y = (centerY - rect.top) * dpr;
      tessera.camera.zoomAt(delta, x, y, canvas.width, canvas.height);
    }

    // Pan
    const panDx = centerX - lastTouchX;
    const panDy = centerY - lastTouchY;
    tessera.camera.pan(panDx * dpr, panDy * dpr, canvas.width, canvas.height);

    lastTouchDistance = distance;
    lastTouchX = centerX;
    lastTouchY = centerY;
    tessera.requestRender();
  }
});

// Set initial cursor
canvas.style.cursor = "grab";

console.log("Controls: drag to pan, scroll to zoom");
console.log(
  `Camera: center=(${tessera.camera.centerX.toFixed(3)}, ${tessera.camera.centerY.toFixed(3)}), zoom=${tessera.camera.zoom}`
);
