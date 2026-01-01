import {
  Tessera,
  FeatureRenderer,
  InstancedPointRenderer,
  type PointInstance,
  type PointShape,
  VERSION,
} from "../src/index";

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

// ============================================
// POLYGONS - Various neighborhoods and areas
// ============================================

// Financial District (z-index: 1, blue)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.405, 37.795],
      [-122.395, 37.795],
      [-122.395, 37.785],
      [-122.405, 37.785],
      [-122.405, 37.795],
    ]),
  ],
}, {
  fillColor: [0.2, 0.4, 0.9, 0.5],
  strokeColor: [0.1, 0.2, 0.6, 1.0],
  strokeWidth: 3,
  zIndex: 1,
});

// SOMA district (z-index: 0, purple, behind Financial)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.415, 37.785],
      [-122.390, 37.785],
      [-122.390, 37.770],
      [-122.415, 37.770],
      [-122.415, 37.785],
    ]),
  ],
}, {
  fillColor: [0.6, 0.2, 0.8, 0.4],
  strokeColor: [0.4, 0.1, 0.5, 1.0],
  strokeWidth: 2,
  zIndex: 0,
});

// Mission District (z-index: 2, orange, on top)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.425, 37.765],
      [-122.405, 37.765],
      [-122.405, 37.750],
      [-122.425, 37.750],
      [-122.425, 37.765],
    ]),
  ],
}, {
  fillColor: [0.95, 0.5, 0.1, 0.5],
  strokeColor: [0.7, 0.3, 0.0, 1.0],
  strokeWidth: 3,
  zIndex: 2,
});

// Golden Gate Park (green with hole)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.51, 37.775],
      [-122.45, 37.775],
      [-122.45, 37.765],
      [-122.51, 37.765],
      [-122.51, 37.775],
    ]),
    // Inner hole (lake)
    convertCoords([
      [-122.49, 37.772],
      [-122.47, 37.772],
      [-122.47, 37.768],
      [-122.49, 37.768],
      [-122.49, 37.772],
    ]),
  ],
}, {
  fillColor: [0.2, 0.7, 0.3, 0.5],
  strokeColor: [0.1, 0.5, 0.2, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Marina District (teal)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.445, 37.805],
      [-122.425, 37.805],
      [-122.425, 37.795],
      [-122.445, 37.795],
      [-122.445, 37.805],
    ]),
  ],
}, {
  fillColor: [0.1, 0.7, 0.7, 0.5],
  strokeColor: [0.0, 0.5, 0.5, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Presidio (dark green)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.475, 37.805],
      [-122.450, 37.805],
      [-122.450, 37.785],
      [-122.475, 37.785],
      [-122.475, 37.805],
    ]),
  ],
}, {
  fillColor: [0.1, 0.4, 0.2, 0.5],
  strokeColor: [0.05, 0.3, 0.1, 1.0],
  strokeWidth: 2,
  zIndex: 0,
});

// ============================================
// LINES - Transit routes and paths
// ============================================

// BART line (blue, thick)
featureRenderer.addFeature({
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.45, 37.78],
    [-122.42, 37.785],
    [-122.40, 37.788],
    [-122.38, 37.785],
    [-122.35, 37.78],
  ]),
}, {
  strokeColor: [0.0, 0.3, 0.8, 1.0],
  strokeWidth: 6,
  strokeCap: "round",
  zIndex: 5,
});

// Muni line (red)
featureRenderer.addFeature({
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.50, 37.77],
    [-122.47, 37.775],
    [-122.44, 37.78],
    [-122.41, 37.785],
    [-122.38, 37.79],
  ]),
}, {
  strokeColor: [0.9, 0.2, 0.2, 1.0],
  strokeWidth: 4,
  strokeCap: "round",
  zIndex: 4,
});

// Cable car route (orange, dashed effect via thin)
featureRenderer.addFeature({
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.42, 37.795],
    [-122.415, 37.79],
    [-122.41, 37.785],
    [-122.405, 37.78],
    [-122.40, 37.775],
  ]),
}, {
  strokeColor: [1.0, 0.6, 0.0, 1.0],
  strokeWidth: 3,
  strokeCap: "butt",
  zIndex: 6,
});

// Waterfront promenade (teal)
featureRenderer.addFeature({
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.39, 37.808],
    [-122.395, 37.805],
    [-122.40, 37.802],
    [-122.405, 37.80],
    [-122.41, 37.798],
    [-122.42, 37.797],
    [-122.43, 37.798],
  ]),
}, {
  strokeColor: [0.0, 0.7, 0.7, 0.9],
  strokeWidth: 3,
  strokeCap: "round",
  zIndex: 3,
});

// Bike path network (green, thin)
featureRenderer.addFeature({
  type: "MultiLineString" as const,
  coordinates: [
    convertCoords([
      [-122.45, 37.79],
      [-122.43, 37.785],
      [-122.41, 37.78],
    ]),
    convertCoords([
      [-122.43, 37.785],
      [-122.43, 37.77],
      [-122.42, 37.755],
    ]),
    convertCoords([
      [-122.41, 37.78],
      [-122.40, 37.775],
      [-122.39, 37.77],
    ]),
  ],
}, {
  strokeColor: [0.2, 0.8, 0.2, 0.8],
  strokeWidth: 2,
  strokeCap: "round",
  zIndex: 3,
});

// Highway 101 (gray, very thick)
featureRenderer.addFeature({
  type: "LineString" as const,
  coordinates: convertCoords([
    [-122.40, 37.81],
    [-122.395, 37.795],
    [-122.39, 37.78],
    [-122.385, 37.765],
    [-122.38, 37.75],
  ]),
}, {
  strokeColor: [0.4, 0.4, 0.4, 0.9],
  strokeWidth: 8,
  strokeCap: "butt",
  zIndex: 2,
});

console.log(`Added ${featureRenderer.featureCount} GeoJSON features`);

// ============================================
// INSTANCED POINTS - Multiple shape types
// ============================================

// Create separate renderers for each shape type
const circleRenderer = new InstancedPointRenderer(tessera.gl);
const squareRenderer = new InstancedPointRenderer(tessera.gl);
const triangleRenderer = new InstancedPointRenderer(tessera.gl);
const diamondRenderer = new InstancedPointRenderer(tessera.gl);

const sfCenter = lngLatToWorld(-122.41, 37.78);

// ============================================
// ANIMATED POINT DATA
// ============================================

interface AnimatedPoint extends PointInstance {
  // Velocity
  vx: number;
  vy: number;
  // Rotation speed
  rotationSpeed: number;
  // Original center for orbiting
  orbitCenterX: number;
  orbitCenterY: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  // Animation type
  animationType: "wander" | "orbit" | "pulse";
  // For pulse animation
  baseSize: number;
  pulseSpeed: number;
  pulsePhase: number;
}

// Generate animated points
function generateAnimatedPoints(
  centerLng: number,
  centerLat: number,
  count: number,
  spread: number,
  baseColor: [number, number, number],
  sizeRange: [number, number],
  animationType: "wander" | "orbit" | "pulse"
): AnimatedPoint[] {
  const center = lngLatToWorld(centerLng, centerLat);
  const points: AnimatedPoint[] = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spread;
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);

    points.push({
      position: [
        center[0] + Math.cos(angle) * distance,
        center[1] + Math.sin(angle) * distance,
      ],
      color: [
        Math.min(1, Math.max(0, baseColor[0] + (Math.random() - 0.5) * 0.3)),
        Math.min(1, Math.max(0, baseColor[1] + (Math.random() - 0.5) * 0.3)),
        Math.min(1, Math.max(0, baseColor[2] + (Math.random() - 0.5) * 0.3)),
        0.85,
      ],
      size,
      rotation: Math.random() * Math.PI * 2,
      // Velocity for wandering
      vx: (Math.random() - 0.5) * 0.00002,
      vy: (Math.random() - 0.5) * 0.00002,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      // Orbit parameters
      orbitCenterX: center[0],
      orbitCenterY: center[1],
      orbitRadius: 0.002 + Math.random() * 0.006,
      orbitSpeed: 0.5 + Math.random() * 1.5,
      orbitPhase: Math.random() * Math.PI * 2,
      animationType,
      // Pulse parameters
      baseSize: size,
      pulseSpeed: 1 + Math.random() * 2,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }
  return points;
}

// Create animated point arrays
let circlePoints = generateAnimatedPoints(-122.405, 37.79, 150, 0.008, [0.3, 0.5, 0.9], [5, 12], "orbit");
let squarePoints = generateAnimatedPoints(-122.405, 37.775, 100, 0.006, [0.9, 0.3, 0.3], [6, 10], "wander");
let trianglePoints = generateAnimatedPoints(-122.40, 37.80, 80, 0.01, [0.2, 0.8, 0.7], [8, 14], "pulse");
let diamondPoints = generateAnimatedPoints(-122.415, 37.758, 60, 0.005, [0.95, 0.7, 0.2], [7, 12], "orbit");

// Initial render
circleRenderer.setInstances("circle", circlePoints);
squareRenderer.setInstances("square", squarePoints);
triangleRenderer.setInstances("triangle", trianglePoints);
diamondRenderer.setInstances("diamond", diamondPoints);

const totalPoints = circlePoints.length + squarePoints.length +
                   trianglePoints.length + diamondPoints.length;
console.log(`Added ${totalPoints} animated points (4 shapes)`);

// ============================================
// ANIMATED POLYGONS
// ============================================

interface AnimatedPolygon {
  centerLng: number;
  centerLat: number;
  radius: number;
  sides: number;
  rotation: number;
  rotationSpeed: number;
  color: [number, number, number, number];
  strokeColor: [number, number, number, number];
  // Movement
  vx: number;
  vy: number;
  // Lifecycle
  age: number;
  maxAge: number;
  fadeIn: number;
  fadeOut: number;
}

const animatedPolygons: AnimatedPolygon[] = [];
const MAX_ANIMATED_POLYGONS = 8;

function createAnimatedPolygon(): AnimatedPolygon {
  const hue = Math.random();
  // HSL to RGB approximation
  const h = hue * 6;
  const c = 0.7;
  const x = c * (1 - Math.abs(h % 2 - 1));
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; }
  else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; }
  else { r = c; b = x; }

  return {
    centerLng: -122.45 + Math.random() * 0.1,
    centerLat: 37.75 + Math.random() * 0.06,
    radius: 0.003 + Math.random() * 0.005,
    sides: 3 + Math.floor(Math.random() * 6), // 3-8 sides
    rotation: 0,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    color: [r + 0.2, g + 0.2, b + 0.2, 0.5],
    strokeColor: [r, g, b, 1.0],
    vx: (Math.random() - 0.5) * 0.0001,
    vy: (Math.random() - 0.5) * 0.0001,
    age: 0,
    maxAge: 300 + Math.random() * 400, // 5-12 seconds at 60fps
    fadeIn: 60,
    fadeOut: 60,
  };
}

// Create initial animated polygons
for (let i = 0; i < MAX_ANIMATED_POLYGONS; i++) {
  const poly = createAnimatedPolygon();
  poly.age = Math.random() * poly.maxAge * 0.5; // Stagger start times
  animatedPolygons.push(poly);
}

function generatePolygonCoords(poly: AnimatedPolygon): number[][] {
  const coords: number[][] = [];
  for (let i = 0; i <= poly.sides; i++) {
    const angle = poly.rotation + (i / poly.sides) * Math.PI * 2;
    const lng = poly.centerLng + Math.cos(angle) * poly.radius * 100; // Scale for lng
    const lat = poly.centerLat + Math.sin(angle) * poly.radius * 80;  // Scale for lat
    coords.push([lng, lat]);
  }
  return coords;
}

// Create a separate feature renderer for animated polygons
const animatedFeatureRenderer = new FeatureRenderer(tessera.gl);

console.log(`Added ${MAX_ANIMATED_POLYGONS} animated polygons`);

// ============================================
// ANIMATION LOOP
// ============================================

let animationTime = 0;
const BOUNDS = {
  minX: sfCenter[0] - 0.015,
  maxX: sfCenter[0] + 0.015,
  minY: sfCenter[1] - 0.012,
  maxY: sfCenter[1] + 0.012,
};

function updateAnimations(dt: number) {
  animationTime += dt;
  const t = animationTime;

  // Update circle points (orbiting)
  for (const p of circlePoints) {
    const angle = p.orbitPhase + t * p.orbitSpeed;
    p.position[0] = p.orbitCenterX + Math.cos(angle) * p.orbitRadius;
    p.position[1] = p.orbitCenterY + Math.sin(angle) * p.orbitRadius;
    p.rotation! += p.rotationSpeed * dt;
  }

  // Update square points (wandering)
  for (const p of squarePoints) {
    p.position[0] += p.vx;
    p.position[1] += p.vy;
    p.rotation! += p.rotationSpeed * dt;

    // Bounce off bounds
    if (p.position[0] < BOUNDS.minX || p.position[0] > BOUNDS.maxX) {
      p.vx *= -1;
      p.position[0] = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.position[0]));
    }
    if (p.position[1] < BOUNDS.minY || p.position[1] > BOUNDS.maxY) {
      p.vy *= -1;
      p.position[1] = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, p.position[1]));
    }
  }

  // Update triangle points (pulsing size + slow rotation)
  for (const p of trianglePoints) {
    p.size = p.baseSize * (1 + 0.3 * Math.sin(t * p.pulseSpeed + p.pulsePhase));
    p.rotation! += p.rotationSpeed * dt * 0.5;
  }

  // Update diamond points (orbiting + color shift)
  for (const p of diamondPoints) {
    const angle = p.orbitPhase + t * p.orbitSpeed * 0.7;
    p.position[0] = p.orbitCenterX + Math.cos(angle) * p.orbitRadius * 0.8;
    p.position[1] = p.orbitCenterY + Math.sin(angle) * p.orbitRadius * 0.8;
    p.rotation! += p.rotationSpeed * dt;
    // Subtle color shimmer
    const shimmer = 0.1 * Math.sin(t * 3 + p.orbitPhase);
    p.color[0] = Math.min(1, 0.95 + shimmer);
  }

  // Update renderers with new positions
  circleRenderer.setInstances("circle", circlePoints);
  squareRenderer.setInstances("square", squarePoints);
  triangleRenderer.setInstances("triangle", trianglePoints);
  diamondRenderer.setInstances("diamond", diamondPoints);

  // Update animated polygons
  animatedFeatureRenderer.clearFeatures();

  for (let i = animatedPolygons.length - 1; i >= 0; i--) {
    const poly = animatedPolygons[i]!;
    poly.age++;

    // Remove expired polygons
    if (poly.age >= poly.maxAge) {
      animatedPolygons.splice(i, 1);
      continue;
    }

    // Update position and rotation
    poly.centerLng += poly.vx;
    poly.centerLat += poly.vy;
    poly.rotation += poly.rotationSpeed;

    // Calculate opacity based on age (fade in/out)
    let opacity = 1;
    if (poly.age < poly.fadeIn) {
      opacity = poly.age / poly.fadeIn;
    } else if (poly.age > poly.maxAge - poly.fadeOut) {
      opacity = (poly.maxAge - poly.age) / poly.fadeOut;
    }

    // Add to renderer with current state
    const coords = generatePolygonCoords(poly);
    animatedFeatureRenderer.addFeature({
      type: "Polygon" as const,
      coordinates: [convertCoords(coords)],
    }, {
      fillColor: [poly.color[0], poly.color[1], poly.color[2], poly.color[3] * opacity],
      strokeColor: [poly.strokeColor[0], poly.strokeColor[1], poly.strokeColor[2], poly.strokeColor[3] * opacity],
      strokeWidth: 2,
      zIndex: 10,
    });
  }

  // Spawn new polygons to maintain count
  while (animatedPolygons.length < MAX_ANIMATED_POLYGONS) {
    animatedPolygons.push(createAnimatedPolygon());
  }
}

// Start centered on San Francisco area
tessera.camera.centerX = 0.17;
tessera.camera.centerY = 0.395;
tessera.camera.zoom = 12;

// Animation timing
let lastTime = performance.now();

// Override render to include features, points, and animations
const originalRender = tessera.render.bind(tessera);
tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000; // Convert to seconds
  lastTime = now;

  // Update all animations
  updateAnimations(dt);

  // Render tiles
  originalRender();

  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  const w = this.canvas.width;
  const h = this.canvas.height;

  // Render static GeoJSON features (neighborhoods, transit lines)
  featureRenderer.render(matrix, w, h);

  // Render animated polygons (spawning/fading shapes)
  animatedFeatureRenderer.render(matrix, w, h);

  // Render instanced points (4 different shapes with different animations)
  circleRenderer.render(matrix, w, h);    // Orbiting
  squareRenderer.render(matrix, w, h);    // Wandering
  triangleRenderer.render(matrix, w, h);  // Pulsing
  diamondRenderer.render(matrix, w, h);   // Orbiting + shimmer

  // Request next frame to keep animation running
  this.requestRender();
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
