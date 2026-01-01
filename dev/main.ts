import { Tessera, DrawContext, VERSION, lonLatToTessera, SDFRenderer, createFontAtlas } from "../src/index";
import earcut from "earcut";
import { ADSBLayer, getAltitudeColor } from "./adsb";

console.log(`Tessera v${VERSION}`);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create immediate mode draw context
const draw = tessera.createDrawContext();

// Create SDF text renderer for aircraft labels
const sdfRenderer = new SDFRenderer(tessera.gl);
const fontAtlas = createFontAtlas({
  fontFamily: "Arial, sans-serif",
  fontSize: 32,
  atlasSize: 512,
});
fontAtlas.ready.then(() => {
  sdfRenderer.loadFontAtlas(fontAtlas.metadata, fontAtlas.image);
  console.log("Font atlas loaded for aircraft labels");
});

// Text styling for aircraft labels
const labelStyle = {
  fontSize: 24,
  color: [1, 1, 1, 1] as [number, number, number, number],
  haloColor: [0, 0, 0, 0.8] as [number, number, number, number],
  haloWidth: 3,
  align: "left" as const,
};

// ============================================
// GRID CONFIGURATION
// ============================================

// Grid layout centered on the US
// 317 x 316 = 100,172 shapes
const usCenter = lonLatToTessera(-98, 39); // Central US (Kansas)
const gridWidth = 317 * 0.00025;
const gridHeight = 316 * 0.00025;
const GRID = {
  startX: usCenter.x - gridWidth / 2,
  startY: usCenter.y - gridHeight / 2,
  cellWidth: 0.00025,
  cellHeight: 0.00025,
  cols: 317,
  rows: 316,
};

// Shape size
const SHAPE_SIZE = 0.00008;

// ============================================
// SHAPE DATA
// ============================================

type ShapeType = "circle" | "square" | "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star";

interface GridShape {
  row: number;
  col: number;
  shape: ShapeType;
  baseHue: number; // 0-1, position-based hue
  size: number;
  rotation: number;
  rotationSpeed: number;
}

const shapes: GridShape[] = [];

// HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h % 1; // Wrap hue to 0-1
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 1/6) { r = c; g = x; b = 0; }
  else if (h < 2/6) { r = x; g = c; b = 0; }
  else if (h < 3/6) { r = 0; g = c; b = x; }
  else if (h < 4/6) { r = 0; g = x; b = c; }
  else if (h < 5/6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [r + m, g + m, b + m];
}

// Animated hue offset (updated each frame)
let hueOffset = 0;

// Animation time for position wave
let animTime = 0;
const WAVE_AMPLITUDE = 0.00015; // How far shapes move from grid position
const WAVE_SPEED = 2.0; // Wave animation speed

const shapeTypes: ShapeType[] = ["circle", "square", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star"];

// Generate grid of shapes
for (let row = 0; row < GRID.rows; row++) {
  for (let col = 0; col < GRID.cols; col++) {
    // Alternate shape types in a pattern
    const shapeIndex = (row + col) % shapeTypes.length;
    const shapeType = shapeTypes[shapeIndex]!;

    // Base hue based on diagonal position (creates rainbow sweep)
    const baseHue = (row + col) / (GRID.rows + GRID.cols);

    // Vary size slightly
    const sizeVariation = 0.7 + ((row * col) % 5) * 0.1;

    // Vary rotation speed - some fast, some slow, some negative
    const speedVariation = ((row * 7 + col * 13) % 10) / 10; // 0 to 0.9
    const direction = ((row + col) % 2 === 0) ? 1 : -1;
    const rotationSpeed = direction * (0.5 + speedVariation * 1.5); // 0.5 to 2.0 rad/s

    shapes.push({
      row,
      col,
      shape: shapeType,
      baseHue,
      size: SHAPE_SIZE * sizeVariation,
      rotation: 0,
      rotationSpeed,
    });
  }
}

console.log(`Created ${shapes.length} shapes in a ${GRID.cols}x${GRID.rows} grid`);

// Sort shapes by type for optimal batching (8 batches instead of 100k)
shapes.sort((a, b) => shapeTypes.indexOf(a.shape) - shapeTypes.indexOf(b.shape));

// ============================================
// PRE-COMPUTED SHAPE TEMPLATES
// ============================================

interface ShapeTemplate {
  // Unit vertices (radius 1, centered at origin)
  vertices: number[]; // [x0, y0, x1, y1, ...]
  indices: number[];
}

// Generate unit polygon vertices
function generatePolygonVertices(sides: number, angleOffset: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = angleOffset + (i / sides) * Math.PI * 2;
    verts.push(Math.cos(angle), Math.sin(angle));
  }
  return verts;
}

// Generate unit circle vertices
function generateCircleVertices(segments: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(Math.cos(angle), Math.sin(angle));
  }
  return verts;
}

// Generate star vertices
function generateStarVertices(points: number, innerRatio: number): number[] {
  const verts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : innerRatio;
    verts.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  return verts;
}

// Helper to create a shape template with earcut tessellation
function createTemplate(vertices: number[]): ShapeTemplate {
  return { vertices, indices: earcut(vertices) };
}

// Pre-compute all shape templates (tessellated once at startup)
const shapeTemplates: Record<ShapeType, ShapeTemplate> = {
  circle: createTemplate(generateCircleVertices(32)),
  triangle: createTemplate(generatePolygonVertices(3, -Math.PI / 2)),
  square: createTemplate(generatePolygonVertices(4, Math.PI / 4)),
  diamond: createTemplate(generatePolygonVertices(4, 0)),
  pentagon: createTemplate(generatePolygonVertices(5, -Math.PI / 2)),
  hexagon: createTemplate(generatePolygonVertices(6, 0)),
  octagon: createTemplate(generatePolygonVertices(8, Math.PI / 8)),
  star: createTemplate(generateStarVertices(5, 0.4)),
};

console.log("Pre-computed shape templates");

// ============================================
// AIRCRAFT TEMPLATE & ADSB LAYER
// ============================================

// Aircraft triangle (pointing up, unit size)
const aircraftVertices = [
  0, -1,     // nose (top)
  -0.5, 0.8, // left wing
  0, 0.4,    // tail notch
  0.5, 0.8,  // right wing
];
const aircraftIndices = earcut(aircraftVertices);

const AIRCRAFT_MIN_SCREEN_SIZE = 12; // Minimum size in pixels (when zoomed out)
const AIRCRAFT_MAX_SCREEN_SIZE = 50; // Maximum size in pixels (when zoomed in)
const AIRCRAFT_BASE_WORLD_SIZE = 0.0015; // Base size that scales with zoom

// Initialize ADSB layer with simulated aircraft
const adsbLayer = new ADSBLayer(10000); // 10k simulated aircraft

// ============================================
// MAIN RENDER LOOP
// ============================================

// Start centered on the US (same as grid)
tessera.camera.centerX = usCenter.x;
tessera.camera.centerY = usCenter.y;
tessera.camera.zoom = 8; // Zoomed in to see grid shapes

let lastTime = performance.now();

const originalRender = tessera.render.bind(tessera);
tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update rotations, hue offset, and animation time
  for (const shape of shapes) {
    shape.rotation += shape.rotationSpeed * dt;
  }
  hueOffset += dt * 0.1; // Slow hue animation
  animTime += dt * WAVE_SPEED;

  // Update simulated aircraft positions
  adsbLayer.update();

  // Render tiles first
  originalRender();

  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  const w = this.canvas.width;
  const h = this.canvas.height;

  // Get visible bounds for culling
  const bounds = this.camera.getVisibleBounds(w, h);

  // ============================================
  // ALL IMMEDIATE MODE DRAWING
  // ============================================
  draw.begin(matrix, w, h);

  // Draw all shapes in grid using pre-computed templates
  let culledCount = 0;
  for (const shape of shapes) {
    // Base grid position
    const baseCx = GRID.startX + shape.col * GRID.cellWidth + GRID.cellWidth / 2;
    const baseCy = GRID.startY + shape.row * GRID.cellHeight + GRID.cellHeight / 2;

    // Wave animation: ripple effect based on distance from center
    const wavePhase = (shape.row + shape.col) * 0.3 + animTime;
    const waveX = Math.sin(wavePhase) * WAVE_AMPLITUDE;
    const waveY = Math.cos(wavePhase * 1.3) * WAVE_AMPLITUDE;

    const cx = baseCx + waveX;
    const cy = baseCy + waveY;
    const r = shape.size; // Bounding radius

    // Frustum culling: skip if shape is completely outside view
    if (cx + r < bounds.left || cx - r > bounds.right ||
        cy + r < bounds.top || cy - r > bounds.bottom) {
      culledCount++;
      continue;
    }

    // Get pre-computed template
    const template = shapeTemplates[shape.shape];

    // Compute color from animated hue
    const hue = shape.baseHue + hueOffset;
    const rgb = hslToRgb(hue, 0.8, 0.55);

    // Fill using template (no tessellation needed!)
    draw.fillStyle = [rgb[0], rgb[1], rgb[2], 0.7];
    draw.fillTemplate(
      template.vertices,
      template.indices,
      cx,
      cy,
      shape.size,
      shape.rotation
    );
  }

  // ============================================
  // DRAW AIRCRAFT
  // ============================================
  // Compute size: scales with zoom, clamped between min/max screen pixels
  const viewWidth = bounds.right - bounds.left;
  const pixelsPerWorldUnit = w / viewWidth;

  // Calculate what screen size the base world size would produce
  let screenSize = AIRCRAFT_BASE_WORLD_SIZE * pixelsPerWorldUnit;

  // Clamp to min/max screen size
  screenSize = Math.max(AIRCRAFT_MIN_SCREEN_SIZE, Math.min(AIRCRAFT_MAX_SCREEN_SIZE, screenSize));

  // Convert back to world size
  const aircraftSize = screenSize / pixelsPerWorldUnit;

  let aircraftDrawn = 0;
  for (const ac of adsbLayer.aircraft) {
    // Frustum culling
    if (ac.x + aircraftSize < bounds.left || ac.x - aircraftSize > bounds.right ||
        ac.y + aircraftSize < bounds.top || ac.y - aircraftSize > bounds.bottom) {
      continue;
    }

    draw.fillStyle = getAltitudeColor(ac.altitude, ac.onGround);
    draw.fillTemplate(
      aircraftVertices,
      aircraftIndices,
      ac.x,
      ac.y,
      aircraftSize,
      ac.heading // Rotate to match flight direction
    );
    aircraftDrawn++;
  }

  draw.end();

  // ============================================
  // DRAW AIRCRAFT LABELS
  // ============================================
  sdfRenderer.clearText();

  // Compute label offset in world units (offset to the right of aircraft)
  const labelOffsetWorld = aircraftSize * 1.2;

  for (const ac of adsbLayer.aircraft) {
    // Frustum culling (same as aircraft)
    if (ac.x + aircraftSize < bounds.left || ac.x - aircraftSize > bounds.right ||
        ac.y + aircraftSize < bounds.top || ac.y - aircraftSize > bounds.bottom) {
      continue;
    }

    // Use callsign if available, otherwise ICAO24 code
    const label = ac.callsign || ac.icao24;
    sdfRenderer.addText(label, ac.x + labelOffsetWorld, ac.y, labelStyle);
  }

  sdfRenderer.render(matrix, w, h);

  // Request next frame for continuous animation
  this.requestRender();
};

// Start render loop
tessera.start();

// ============================================
// INPUT HANDLING
// ============================================

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

console.log("Controls: drag to pan, scroll to zoom");
console.log(`Grid: ${GRID.cols}x${GRID.rows} = ${shapes.length} shapes`);
