import { Tessera, DrawContext, VERSION, lonLatToTessera, SDFRenderer, createFontAtlas } from "../src/index";
import earcut from "earcut";
import { ADSBLayer, getAltitudeColor } from "./adsb";
import { loadStateBorderPoints, type BorderPoint } from "./borders";

console.log(`Tessera v${VERSION}`);

// ============================================
// LABEL CLUSTERING (Spatial Binning)
// ============================================

// Label size scaling (similar to aircraft)
const LABEL_FULL_SIZE = 18; // Font size at full zoom
const LABEL_FULL_SIZE_ZOOM = 8; // Zoom level at which labels are full size
const LABEL_MIN_SIZE = 12; // Minimum font size when zoomed out

// Grid cell dimensions scale with font size
const LABEL_CELL_WIDTH_RATIO = 8;  // Cell width = fontSize * this ratio
const LABEL_CELL_HEIGHT_RATIO = 2;  // Cell height = fontSize * this ratio
let DEBUG_SHOW_GRID = false;   // Toggle with 'G' key

// Estimated label dimensions for center-based binning
const LABEL_AVG_CHARS = 10;    // Average characters in label (e.g., "AAL123 +4")
const LABEL_CHAR_WIDTH = 0.55; // Approximate width per character as fraction of font size

interface ClusterableItem {
  x: number;
  y: number;
  callsign: string | null;
  icao24: string;
}

interface LabelCluster {
  aircraft: ClusterableItem[];
  screenX: number;
  screenY: number;
}

/** Convert world coordinates to screen pixels */
function worldToScreen(
  worldX: number,
  worldY: number,
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number
): { screenX: number; screenY: number } {
  // Apply 3x3 matrix: clipX = matrix[0]*x + matrix[3]*y + matrix[6]
  const clipX = matrix[0] * worldX + matrix[3] * worldY + matrix[6];
  const clipY = matrix[1] * worldX + matrix[4] * worldY + matrix[7];

  // Clip space (-1,1) to screen pixels
  const screenX = (clipX + 1) * 0.5 * viewportWidth;
  const screenY = (1 - clipY) * 0.5 * viewportHeight; // Y flipped

  return { screenX, screenY };
}

/** Convert screen pixels to world coordinates (inverse of worldToScreen) */
function screenToWorld(
  screenX: number,
  screenY: number,
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number
): { worldX: number; worldY: number } {
  // Screen to clip space
  const clipX = (screenX / viewportWidth) * 2 - 1;
  const clipY = 1 - (screenY / viewportHeight) * 2; // Y flipped

  // Invert 2x2 part of matrix (ignoring translation for now)
  // matrix is [a, b, 0, c, d, 0, tx, ty, 1] in column-major
  // For our camera matrix: a=scale, b=0, c=0, d=-scale, tx, ty
  const a = matrix[0], b = matrix[3];
  const c = matrix[1], d = matrix[4];
  const tx = matrix[6], ty = matrix[7];

  // Solve: clipX = a*x + b*y + tx, clipY = c*x + d*y + ty
  const det = a * d - b * c;
  const worldX = (d * (clipX - tx) - b * (clipY - ty)) / det;
  const worldY = (-c * (clipX - tx) + a * (clipY - ty)) / det;

  return { worldX, worldY };
}

/**
 * Check if object at worldX is visible with horizontal wrapping.
 * Returns the X coordinate to use for rendering if visible, or null if not visible.
 */
function getWrappedX(
  worldX: number,
  radius: number,
  boundsLeft: number,
  boundsRight: number
): number | null {
  // Check primary position
  if (worldX + radius >= boundsLeft && worldX - radius <= boundsRight) {
    return worldX;
  }

  // Check wrapped +1 (for when camera is past x=1)
  const wrappedPlus = worldX + 1;
  if (wrappedPlus + radius >= boundsLeft && wrappedPlus - radius <= boundsRight) {
    return wrappedPlus;
  }

  // Check wrapped -1 (for when camera is before x=0)
  const wrappedMinus = worldX - 1;
  if (wrappedMinus + radius >= boundsLeft && wrappedMinus - radius <= boundsRight) {
    return wrappedMinus;
  }

  return null; // Not visible at any wrap position
}

/** Group aircraft into spatial bins for label clustering */
function clusterLabels(
  aircraft: ClusterableItem[],
  matrix: Float32Array,
  viewportWidth: number,
  viewportHeight: number,
  labelOffsetWorld: number,
  labelFontSize: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  fixedGridOffset?: { x: number; y: number }
): { clusters: LabelCluster[]; gridOffset: { x: number; y: number }; cellWidth: number; cellHeight: number } {
  const grid = new Map<string, LabelCluster>();

  // Scale cell dimensions with font size
  const cellWidth = labelFontSize * LABEL_CELL_WIDTH_RATIO;
  const cellHeight = labelFontSize * LABEL_CELL_HEIGHT_RATIO;

  // Calculate current grid offset from world origin
  const origin = worldToScreen(0, 0, matrix, viewportWidth, viewportHeight);
  const currentOffset = {
    x: ((origin.screenX % cellWidth) + cellWidth) % cellWidth,
    y: ((origin.screenY % cellHeight) + cellHeight) % cellHeight,
  };

  // Use fixed offset if provided (for stable clustering during zoom)
  const gridOffsetX = fixedGridOffset?.x ?? currentOffset.x;
  const gridOffsetY = fixedGridOffset?.y ?? currentOffset.y;

  // Estimate label width in screen pixels for center-based binning
  const estLabelWidth = labelFontSize * LABEL_CHAR_WIDTH * LABEL_AVG_CHARS;
  const halfLabelWidth = estLabelWidth / 2;
  // Label radius in world units for wrapping check
  const labelRadiusWorld = (estLabelWidth / viewportWidth) * (bounds.right - bounds.left);

  for (const ac of aircraft) {
    // Y culling (no wrapping for vertical)
    if (ac.y < bounds.top || ac.y > bounds.bottom) {
      continue;
    }

    // Use LABEL position for binning, not aircraft position
    // Labels are offset to the right of aircraft
    const labelX = ac.x + labelOffsetWorld;
    const labelY = ac.y;

    // Check wrapped X position for visibility
    const renderLabelX = getWrappedX(labelX, labelRadiusWorld, bounds.left, bounds.right);
    if (renderLabelX === null) {
      continue;
    }

    const { screenX, screenY } = worldToScreen(renderLabelX, labelY, matrix, viewportWidth, viewportHeight);

    // Use label CENTER for cell assignment (improves border behavior)
    const labelCenterX = screenX + halfLabelWidth;
    const cellX = Math.floor((labelCenterX - gridOffsetX) / cellWidth);
    const cellY = Math.floor((screenY - gridOffsetY) / cellHeight);
    const key = `${cellX}_${cellY}`;

    let cluster = grid.get(key);
    if (!cluster) {
      cluster = { aircraft: [], screenX, screenY };
      grid.set(key, cluster);
    }
    // Store wrapped aircraft position for rendering
    cluster.aircraft.push({ ...ac, x: renderLabelX - labelOffsetWorld });
  }

  return { clusters: Array.from(grid.values()), gridOffset: currentOffset, cellWidth, cellHeight };
}

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

// Text styling for aircraft labels (fontSize will be scaled dynamically)
const labelStyle = {
  fontSize: LABEL_FULL_SIZE,
  color: [1, 1, 1, 1] as [number, number, number, number],
  haloColor: [0, 0, 0, 0.8] as [number, number, number, number],
  haloWidth: 2,
  align: "left" as const,
};

// ============================================
// SHAPE CONFIGURATION
// ============================================

// Shape size
const SHAPE_SIZE = 0.00008;

// Spacing between shapes along borders (in Tessera world units)
const BORDER_SPACING = 0.0002;

// ============================================
// SHAPE DATA
// ============================================

type ShapeType = "circle" | "square" | "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star";

interface BorderShape {
  baseX: number;      // Border point X coordinate
  baseY: number;      // Border point Y coordinate
  index: number;      // Index for wave animation phase
  shape: ShapeType;
  baseHue: number;    // 0-1, position-based hue
  size: number;
  rotation: number;
  rotationSpeed: number;
}

// Shapes array - populated async on load
let shapes: BorderShape[] = [];
let shapesLoaded = false;

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

// Load border shapes asynchronously
async function loadBorderShapes(): Promise<void> {
  const borderPoints = await loadStateBorderPoints(BORDER_SPACING);

  for (let i = 0; i < borderPoints.length; i++) {
    const point = borderPoints[i]!;

    // Alternate shape types in a pattern
    const shapeIndex = i % shapeTypes.length;
    const shapeType = shapeTypes[shapeIndex]!;

    // Base hue based on position along border (creates rainbow sweep)
    const baseHue = i / borderPoints.length;

    // Vary size slightly
    const sizeVariation = 0.7 + ((i * 7) % 5) * 0.1;

    // Vary rotation speed - some fast, some slow, some negative
    const speedVariation = ((i * 13) % 10) / 10; // 0 to 0.9
    const direction = (i % 2 === 0) ? 1 : -1;
    const rotationSpeed = direction * (0.5 + speedVariation * 1.5); // 0.5 to 2.0 rad/s

    shapes.push({
      baseX: point.x,
      baseY: point.y,
      index: i,
      shape: shapeType,
      baseHue,
      size: SHAPE_SIZE * sizeVariation,
      rotation: 0,
      rotationSpeed,
    });
  }

  console.log(`Created ${shapes.length} shapes along US state borders`);

  // Sort shapes by type for optimal batching (8 batches instead of 100k)
  shapes.sort((a, b) => shapeTypes.indexOf(a.shape) - shapeTypes.indexOf(b.shape));
  shapesLoaded = true;
}

// Start loading border shapes
loadBorderShapes();

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

const AIRCRAFT_SCREEN_SIZE = 15; // Size in pixels at full zoom
const AIRCRAFT_FULL_SIZE_ZOOM = 8; // Zoom level at which aircraft are full size
const AIRCRAFT_MIN_SIZE = 3; // Minimum size in pixels when zoomed out

// Initialize ADSB layer with simulated aircraft
const adsbLayer = new ADSBLayer(10000); // 10k simulated aircraft

// ============================================
// MAIN RENDER LOOP
// ============================================

// Start centered on the US
const usCenter = lonLatToTessera(-98, 39); // Central US (Kansas)
tessera.camera.centerX = usCenter.x;
tessera.camera.centerY = usCenter.y;
tessera.camera.zoom = 8; // Zoomed in to see border shapes

let lastTime = performance.now();

const originalRender = tessera.render.bind(tessera);
// Cached grid offset for stable clustering during zoom animation
let cachedGridOffset: { x: number; y: number } | null = null;

tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update inertial zoom animation
  if (this.camera.updateZoom(dt)) {
    this.requestRender();
  }

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

  // Draw all shapes along state borders using pre-computed templates
  let culledCount = 0;
  for (const shape of shapes) {
    // Wave animation: ripple effect along border
    const wavePhase = shape.index * 0.3 + animTime;
    const waveX = Math.sin(wavePhase) * WAVE_AMPLITUDE;
    const waveY = Math.cos(wavePhase * 1.3) * WAVE_AMPLITUDE;

    const cx = shape.baseX + waveX;
    const cy = shape.baseY + waveY;
    const r = shape.size; // Bounding radius

    // Y culling (no wrapping for vertical)
    if (cy + r < bounds.top || cy - r > bounds.bottom) {
      culledCount++;
      continue;
    }

    // X culling with horizontal wrapping
    const renderCx = getWrappedX(cx, r, bounds.left, bounds.right);
    if (renderCx === null) {
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
      renderCx,
      cy,
      shape.size,
      shape.rotation
    );
  }

  // ============================================
  // DRAW AIRCRAFT
  // ============================================
  // Screen size scales down when zoomed out below threshold
  const viewWidth = bounds.right - bounds.left;
  const pixelsPerWorldUnit = w / viewWidth;

  // Scale aircraft size based on zoom level
  let aircraftScreenSize = AIRCRAFT_SCREEN_SIZE;
  if (this.camera.zoom < AIRCRAFT_FULL_SIZE_ZOOM) {
    // Linear interpolation from MIN_SIZE at zoom 4 to FULL_SIZE at zoom 7
    const t = (this.camera.zoom - 4) / (AIRCRAFT_FULL_SIZE_ZOOM - 4);
    aircraftScreenSize = AIRCRAFT_MIN_SIZE + (AIRCRAFT_SCREEN_SIZE - AIRCRAFT_MIN_SIZE) * Math.max(0, t);
  }
  const aircraftSize = aircraftScreenSize / pixelsPerWorldUnit;

  let aircraftDrawn = 0;
  for (const ac of adsbLayer.aircraft) {
    // Y culling (no wrapping for vertical)
    if (ac.y + aircraftSize < bounds.top || ac.y - aircraftSize > bounds.bottom) {
      continue;
    }

    // X culling with horizontal wrapping
    const renderX = getWrappedX(ac.x, aircraftSize, bounds.left, bounds.right);
    if (renderX === null) {
      continue;
    }

    draw.fillStyle = getAltitudeColor(ac.altitude, ac.onGround);
    draw.fillTemplate(
      aircraftVertices,
      aircraftIndices,
      renderX,
      ac.y,
      aircraftSize,
      ac.heading // Rotate to match flight direction
    );
    aircraftDrawn++;
  }

  draw.end();

  // ============================================
  // DRAW AIRCRAFT LABELS (with spatial clustering)
  // ============================================
  sdfRenderer.clearText();

  // Hide labels completely below zoom 5.5
  const showLabels = this.camera.zoom >= 5.5;

  // Scale label font size based on zoom level
  let labelFontSize = LABEL_FULL_SIZE;
  if (this.camera.zoom < LABEL_FULL_SIZE_ZOOM) {
    const t = (this.camera.zoom - 4) / (LABEL_FULL_SIZE_ZOOM - 4);
    labelFontSize = LABEL_MIN_SIZE + (LABEL_FULL_SIZE - LABEL_MIN_SIZE) * Math.max(0, t);
  }

  if (showLabels) {
    // Compute label offset in world units (offset to the right of aircraft)
    const labelOffsetWorld = aircraftSize * 1.2;

    // During zoom animation, use cached grid offset for stable grouping
    // Labels still move (recalculated each frame) but groupings stay consistent
    const isZooming = this.camera.isZoomAnimating();
    const { clusters, gridOffset, cellWidth, cellHeight } = clusterLabels(
      adsbLayer.aircraft,
      matrix,
      w,
      h,
      labelOffsetWorld,
      labelFontSize,
      bounds,
      isZooming ? cachedGridOffset ?? undefined : undefined
    );

    // Cache grid offset when not zooming (for next zoom animation)
    if (!isZooming) {
      cachedGridOffset = gridOffset;
    }

    // Debug: draw the spatial binning grid
    if (DEBUG_SHOW_GRID) {
      draw.begin(matrix, w, h);
      draw.strokeStyle = [1, 0, 1, 0.5]; // Magenta, semi-transparent
      draw.lineWidth = 1;

      // Use the same grid offset as clustering
      const effectiveOffset = isZooming && cachedGridOffset ? cachedGridOffset : gridOffset;

      // Draw vertical lines
      for (let screenX = effectiveOffset.x; screenX <= w; screenX += cellWidth) {
        const top = screenToWorld(screenX, 0, matrix, w, h);
        const bottom = screenToWorld(screenX, h, matrix, w, h);
        draw.beginPath();
        draw.moveTo(top.worldX, top.worldY);
        draw.lineTo(bottom.worldX, bottom.worldY);
        draw.stroke();
      }
      // Draw lines going left from offset
      for (let screenX = effectiveOffset.x - cellWidth; screenX >= 0; screenX -= cellWidth) {
        const top = screenToWorld(screenX, 0, matrix, w, h);
        const bottom = screenToWorld(screenX, h, matrix, w, h);
        draw.beginPath();
        draw.moveTo(top.worldX, top.worldY);
        draw.lineTo(bottom.worldX, bottom.worldY);
        draw.stroke();
      }

      // Draw horizontal lines
      for (let screenY = effectiveOffset.y; screenY <= h; screenY += cellHeight) {
        const left = screenToWorld(0, screenY, matrix, w, h);
        const right = screenToWorld(w, screenY, matrix, w, h);
        draw.beginPath();
        draw.moveTo(left.worldX, left.worldY);
        draw.lineTo(right.worldX, right.worldY);
        draw.stroke();
      }
      // Draw lines going up from offset
      for (let screenY = effectiveOffset.y - cellHeight; screenY >= 0; screenY -= cellHeight) {
        const left = screenToWorld(0, screenY, matrix, w, h);
        const right = screenToWorld(w, screenY, matrix, w, h);
        draw.beginPath();
        draw.moveTo(left.worldX, left.worldY);
        draw.lineTo(right.worldX, right.worldY);
        draw.stroke();
      }

      draw.end();
    }

    // Create scaled label style for this frame
    const scaledLabelStyle = { ...labelStyle, fontSize: labelFontSize };

    for (const cluster of clusters) {
      const representative = cluster.aircraft[0]!;
      const count = cluster.aircraft.length;

      // Format label: single aircraft shows full label, clusters show "+N"
      let label: string;
      if (count === 1) {
        label = representative.callsign || representative.icao24;
      } else {
        const name = representative.callsign || representative.icao24;
        label = `${name} +${count - 1}`;
      }

      // Position label next to representative aircraft
      sdfRenderer.addText(
        label,
        representative.x + labelOffsetWorld,
        representative.y,
        scaledLabelStyle
      );
    }
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
    DEBUG_SHOW_GRID = !DEBUG_SHOW_GRID;
    console.log(`Debug grid: ${DEBUG_SHOW_GRID ? "ON" : "OFF"}`);
    tessera.requestRender();
  }
});

console.log("Controls: drag to pan, scroll to zoom, G to toggle grid");
console.log("Shapes loaded along US state borders (count will appear when loaded)");
