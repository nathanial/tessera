import { Tessera, DrawContext, VERSION } from "../src/index";

console.log(`Tessera v${VERSION}`);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create immediate mode draw context
const draw = tessera.createDrawContext();

/**
 * Convert WGS84 coordinates to Web Mercator (0-1 world space)
 */
function lngLatToWorld(lng: number, lat: number): [number, number] {
  const x = (lng + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return [x, y];
}

// ============================================
// POLYGON DATA - Neighborhoods and areas
// ============================================

interface PolygonData {
  coords: number[][][]; // rings of [lng, lat]
  fillColor: [number, number, number, number];
  strokeColor: [number, number, number, number];
  strokeWidth: number;
}

const S = 0.0001; // Small polygon size

const staticPolygons: PolygonData[] = [
  // Financial District - Downtown SF (blue)
  {
    coords: [[
      [-122.400, 37.792],
      [-122.400 + S, 37.792],
      [-122.400 + S, 37.792 - S],
      [-122.400, 37.792 - S],
    ]],
    fillColor: [0.2, 0.4, 0.9, 0.5],
    strokeColor: [0.1, 0.2, 0.6, 1.0],
    strokeWidth: 3,
  },
  // Oakland Downtown (purple)
  {
    coords: [[
      [-122.275, 37.805],
      [-122.275 + S, 37.805],
      [-122.275 + S, 37.805 - S],
      [-122.275, 37.805 - S],
    ]],
    fillColor: [0.6, 0.2, 0.8, 0.5],
    strokeColor: [0.4, 0.1, 0.5, 1.0],
    strokeWidth: 2,
  },
  // Berkeley (orange)
  {
    coords: [[
      [-122.272, 37.872],
      [-122.272 + S, 37.872],
      [-122.272 + S, 37.872 - S],
      [-122.272, 37.872 - S],
    ]],
    fillColor: [0.95, 0.5, 0.1, 0.5],
    strokeColor: [0.7, 0.3, 0.0, 1.0],
    strokeWidth: 3,
  },
  // Sausalito (teal)
  {
    coords: [[
      [-122.482, 37.858],
      [-122.482 + S, 37.858],
      [-122.482 + S, 37.858 - S],
      [-122.482, 37.858 - S],
    ]],
    fillColor: [0.1, 0.7, 0.7, 0.5],
    strokeColor: [0.0, 0.5, 0.5, 1.0],
    strokeWidth: 2,
  },
  // Daly City (dark green)
  {
    coords: [[
      [-122.465, 37.690],
      [-122.465 + S, 37.690],
      [-122.465 + S, 37.690 - S],
      [-122.465, 37.690 - S],
    ]],
    fillColor: [0.1, 0.4, 0.2, 0.5],
    strokeColor: [0.05, 0.3, 0.1, 1.0],
    strokeWidth: 2,
  },
  // Alameda (red)
  {
    coords: [[
      [-122.265, 37.768],
      [-122.265 + S * 1.5, 37.768],
      [-122.265 + S * 1.5, 37.768 - S * 0.7],
      [-122.265, 37.768 - S * 0.7],
    ]],
    fillColor: [0.9, 0.2, 0.2, 0.5],
    strokeColor: [0.7, 0.1, 0.1, 1.0],
    strokeWidth: 2,
  },
  // Treasure Island (gold)
  {
    coords: [[
      [-122.373, 37.822],
      [-122.373 + S * 0.8, 37.822],
      [-122.373 + S * 0.8, 37.822 - S * 0.6],
      [-122.373, 37.822 - S * 0.6],
    ]],
    fillColor: [0.9, 0.75, 0.1, 0.5],
    strokeColor: [0.7, 0.55, 0.0, 1.0],
    strokeWidth: 2,
  },
];

// Golden Gate Park (green with lake hole)
const parkW = 0.0003;
const parkH = 0.0001;
staticPolygons.push({
  coords: [
    // Outer ring
    [
      [-122.480, 37.770],
      [-122.480 + parkW, 37.770],
      [-122.480 + parkW, 37.770 - parkH],
      [-122.480, 37.770 - parkH],
    ],
    // Inner hole (lake) - note: holes not yet supported in immediate mode
  ],
  fillColor: [0.2, 0.7, 0.3, 0.5],
  strokeColor: [0.1, 0.5, 0.2, 1.0],
  strokeWidth: 2,
});

// STRESS TEST: Generate 200 random polygons
for (let i = 0; i < 200; i++) {
  const centerLng = -122.55 + Math.random() * 0.35;
  const centerLat = 37.68 + Math.random() * 0.25;
  const size = 0.00004 + Math.random() * 0.00008;
  const sides = 3 + Math.floor(Math.random() * 6);
  const rotation = Math.random() * Math.PI * 2;

  const coords: number[][] = [];
  for (let j = 0; j < sides; j++) {
    const angle = rotation + (j / sides) * Math.PI * 2;
    coords.push([
      centerLng + Math.cos(angle) * size,
      centerLat + Math.sin(angle) * size * 0.8,
    ]);
  }

  const hue = Math.random();
  const r = Math.abs(Math.sin(hue * Math.PI * 2)) * 0.7 + 0.3;
  const g = Math.abs(Math.sin((hue + 0.33) * Math.PI * 2)) * 0.7 + 0.3;
  const b = Math.abs(Math.sin((hue + 0.66) * Math.PI * 2)) * 0.7 + 0.3;

  staticPolygons.push({
    coords: [coords],
    fillColor: [r, g, b, 0.3 + Math.random() * 0.3],
    strokeColor: [r * 0.7, g * 0.7, b * 0.7, 0.8],
    strokeWidth: 1 + Math.random() * 2,
  });
}

console.log(`Created ${staticPolygons.length} static polygons`);

// ============================================
// LINE DATA - Transit routes and paths
// ============================================

interface LineData {
  coords: number[][]; // [lng, lat] points
  color: [number, number, number, number];
  width: number;
  cap: "butt" | "round" | "square";
}

const staticLines: LineData[] = [
  // BART line (blue, thick)
  {
    coords: [
      [-122.45, 37.78],
      [-122.42, 37.785],
      [-122.40, 37.788],
      [-122.38, 37.785],
      [-122.35, 37.78],
    ],
    color: [0.0, 0.3, 0.8, 1.0],
    width: 6,
    cap: "round",
  },
  // Muni line (red)
  {
    coords: [
      [-122.50, 37.77],
      [-122.47, 37.775],
      [-122.44, 37.78],
      [-122.41, 37.785],
      [-122.38, 37.79],
    ],
    color: [0.9, 0.2, 0.2, 1.0],
    width: 4,
    cap: "round",
  },
  // Cable car route (orange)
  {
    coords: [
      [-122.42, 37.795],
      [-122.415, 37.79],
      [-122.41, 37.785],
      [-122.405, 37.78],
      [-122.40, 37.775],
    ],
    color: [1.0, 0.6, 0.0, 1.0],
    width: 3,
    cap: "butt",
  },
  // Waterfront promenade (teal)
  {
    coords: [
      [-122.39, 37.808],
      [-122.395, 37.805],
      [-122.40, 37.802],
      [-122.405, 37.80],
      [-122.41, 37.798],
      [-122.42, 37.797],
      [-122.43, 37.798],
    ],
    color: [0.0, 0.7, 0.7, 0.9],
    width: 3,
    cap: "round",
  },
  // Highway 101 (gray, very thick)
  {
    coords: [
      [-122.40, 37.81],
      [-122.395, 37.795],
      [-122.39, 37.78],
      [-122.385, 37.765],
      [-122.38, 37.75],
    ],
    color: [0.4, 0.4, 0.4, 0.9],
    width: 8,
    cap: "butt",
  },
];

// Bike path network (green, thin) - multiple segments
const bikePaths = [
  [[-122.45, 37.79], [-122.43, 37.785], [-122.41, 37.78]],
  [[-122.43, 37.785], [-122.43, 37.77], [-122.42, 37.755]],
  [[-122.41, 37.78], [-122.40, 37.775], [-122.39, 37.77]],
];
for (const path of bikePaths) {
  staticLines.push({
    coords: path,
    color: [0.2, 0.8, 0.2, 0.8],
    width: 2,
    cap: "round",
  });
}

// STRESS TEST: Generate 300 random lines
for (let i = 0; i < 300; i++) {
  const startLng = -122.55 + Math.random() * 0.35;
  const startLat = 37.68 + Math.random() * 0.25;
  const segments = 2 + Math.floor(Math.random() * 6);

  const coords: number[][] = [[startLng, startLat]];
  let lng = startLng;
  let lat = startLat;

  for (let j = 0; j < segments; j++) {
    lng += (Math.random() - 0.5) * 0.02;
    lat += (Math.random() - 0.5) * 0.015;
    coords.push([lng, lat]);
  }

  const hue = Math.random();
  const r = Math.abs(Math.sin(hue * Math.PI * 2)) * 0.8 + 0.2;
  const g = Math.abs(Math.sin((hue + 0.33) * Math.PI * 2)) * 0.8 + 0.2;
  const b = Math.abs(Math.sin((hue + 0.66) * Math.PI * 2)) * 0.8 + 0.2;

  const caps: Array<"butt" | "round" | "square"> = ["butt", "round", "square"];

  staticLines.push({
    coords,
    color: [r, g, b, 0.6 + Math.random() * 0.4],
    width: 1 + Math.random() * 4,
    cap: caps[Math.floor(Math.random() * 3)]!,
  });
}

console.log(`Created ${staticLines.length} static lines`);

// ============================================
// ANIMATED POINT DATA
// ============================================

interface AnimatedPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: [number, number, number, number];
  size: number;
  baseSize: number;
  rotation: number;
  rotationSpeed: number;
  orbitCenterX: number;
  orbitCenterY: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  pulseSpeed: number;
  pulsePhase: number;
  shape: "circle" | "square" | "triangle" | "diamond";
  animationType: "orbit" | "wander" | "pulse";
}

const animatedPoints: AnimatedPoint[] = [];
const bayAreaCenter = lngLatToWorld(-122.38, 37.82);

function generatePoints(
  centerLng: number,
  centerLat: number,
  count: number,
  spread: number,
  baseColor: [number, number, number],
  sizeRange: [number, number],
  shape: "circle" | "square" | "triangle" | "diamond",
  animationType: "orbit" | "wander" | "pulse"
) {
  const center = lngLatToWorld(centerLng, centerLat);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spread;
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);

    animatedPoints.push({
      x: center[0] + Math.cos(angle) * distance,
      y: center[1] + Math.sin(angle) * distance,
      vx: (Math.random() - 0.5) * 0.000005,
      vy: (Math.random() - 0.5) * 0.000005,
      color: [
        Math.min(1, Math.max(0, baseColor[0] + (Math.random() - 0.5) * 0.3)),
        Math.min(1, Math.max(0, baseColor[1] + (Math.random() - 0.5) * 0.3)),
        Math.min(1, Math.max(0, baseColor[2] + (Math.random() - 0.5) * 0.3)),
        0.85,
      ],
      size,
      baseSize: size,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      orbitCenterX: center[0],
      orbitCenterY: center[1],
      orbitRadius: 0.00002 + Math.random() * 0.0002,
      orbitSpeed: 0.05 + Math.random() * 0.25,
      orbitPhase: Math.random() * Math.PI * 2,
      pulseSpeed: 1 + Math.random() * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      shape,
      animationType,
    });
  }
}

// Generate points for each shape type - reduced count for immediate mode performance
generatePoints(-122.40, 37.79, 500, 0.002, [0.3, 0.5, 0.9], [0.00004, 0.00008], "circle", "orbit");
generatePoints(-122.27, 37.80, 500, 0.002, [0.9, 0.3, 0.3], [0.00004, 0.00007], "square", "wander");
generatePoints(-122.27, 37.87, 500, 0.002, [0.2, 0.8, 0.7], [0.00005, 0.00008], "triangle", "pulse");
generatePoints(-122.48, 37.85, 500, 0.002, [0.95, 0.7, 0.2], [0.00005, 0.00008], "diamond", "orbit");

console.log(`Created ${animatedPoints.length} animated points`);

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
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  fadeIn: number;
  fadeOut: number;
}

const animatedPolygons: AnimatedPolygon[] = [];
const MAX_ANIMATED_POLYGONS = 50;

function createAnimatedPolygon(): AnimatedPolygon {
  const hue = Math.random();
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
    centerLng: -122.45 + Math.random() * 0.12,
    centerLat: 37.76 + Math.random() * 0.10,
    radius: 0.00006 + Math.random() * 0.0001,
    sides: 3 + Math.floor(Math.random() * 6),
    rotation: 0,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    color: [r + 0.2, g + 0.2, b + 0.2, 0.5],
    strokeColor: [r, g, b, 1.0],
    vx: (Math.random() - 0.5) * 0.0001,
    vy: (Math.random() - 0.5) * 0.0001,
    age: 0,
    maxAge: 300 + Math.random() * 400,
    fadeIn: 60,
    fadeOut: 60,
  };
}

// Create initial animated polygons
for (let i = 0; i < MAX_ANIMATED_POLYGONS; i++) {
  const poly = createAnimatedPolygon();
  poly.age = Math.random() * poly.maxAge * 0.5;
  animatedPolygons.push(poly);
}

console.log(`Created ${MAX_ANIMATED_POLYGONS} animated polygons`);

// ============================================
// ANIMATION STATE
// ============================================

let animationTime = 0;
const BOUNDS = {
  minX: bayAreaCenter[0] - 0.004,
  maxX: bayAreaCenter[0] + 0.004,
  minY: bayAreaCenter[1] - 0.003,
  maxY: bayAreaCenter[1] + 0.003,
};

// ============================================
// DRAWING FUNCTIONS
// ============================================

function drawPolygon(coords: number[][], closed: boolean = true) {
  if (coords.length === 0) return;
  const [startLng, startLat] = coords[0]!;
  const [sx, sy] = lngLatToWorld(startLng!, startLat!);
  draw.moveTo(sx, sy);

  for (let i = 1; i < coords.length; i++) {
    const [lng, lat] = coords[i]!;
    const [x, y] = lngLatToWorld(lng!, lat!);
    draw.lineTo(x, y);
  }

  if (closed) {
    draw.closePath();
  }
}

function drawShape(
  cx: number,
  cy: number,
  size: number,
  shape: "circle" | "square" | "triangle" | "diamond",
  rotation: number
) {
  if (shape === "circle") {
    draw.beginPath();
    draw.arc(cx, cy, size, 0, Math.PI * 2);
    draw.fill();
  } else {
    const sides = shape === "triangle" ? 3 : 4;
    const angleOffset = shape === "diamond" ? Math.PI / 4 : 0;

    draw.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = rotation + angleOffset + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(angle) * size;
      const y = cy + Math.sin(angle) * size;
      if (i === 0) {
        draw.moveTo(x, y);
      } else {
        draw.lineTo(x, y);
      }
    }
    draw.closePath();
    draw.fill();
  }
}

// ============================================
// MAIN RENDER LOOP
// ============================================

// Start centered on San Francisco
const sfWorld = lngLatToWorld(-122.42, 37.78);
tessera.camera.centerX = sfWorld[0];
tessera.camera.centerY = sfWorld[1];
tessera.camera.zoom = 12;

let lastTime = performance.now();

const originalRender = tessera.render.bind(tessera);
tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  animationTime += dt;

  // Render tiles first
  originalRender();

  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  const w = this.canvas.width;
  const h = this.canvas.height;

  // ============================================
  // ALL IMMEDIATE MODE DRAWING
  // ============================================
  draw.begin(matrix, w, h);

  // --- Static Polygons ---
  for (const poly of staticPolygons) {
    // Fill
    draw.fillStyle = poly.fillColor;
    draw.beginPath();
    drawPolygon(poly.coords[0]!);
    draw.fill();

    // Stroke
    draw.strokeStyle = poly.strokeColor;
    draw.lineWidth = poly.strokeWidth;
    draw.beginPath();
    drawPolygon(poly.coords[0]!);
    draw.stroke();
  }

  // --- Static Lines ---
  for (const line of staticLines) {
    draw.strokeStyle = line.color;
    draw.lineWidth = line.width;
    draw.lineCap = line.cap;
    draw.beginPath();
    drawPolygon(line.coords, false);
    draw.stroke();
  }

  // --- Animated Polygons ---
  for (let i = animatedPolygons.length - 1; i >= 0; i--) {
    const poly = animatedPolygons[i]!;
    poly.age++;

    if (poly.age >= poly.maxAge) {
      animatedPolygons.splice(i, 1);
      continue;
    }

    poly.centerLng += poly.vx;
    poly.centerLat += poly.vy;
    poly.rotation += poly.rotationSpeed;

    let opacity = 1;
    if (poly.age < poly.fadeIn) {
      opacity = poly.age / poly.fadeIn;
    } else if (poly.age > poly.maxAge - poly.fadeOut) {
      opacity = (poly.maxAge - poly.age) / poly.fadeOut;
    }

    // Draw animated polygon
    const center = lngLatToWorld(poly.centerLng, poly.centerLat);
    draw.fillStyle = [poly.color[0], poly.color[1], poly.color[2], poly.color[3] * opacity];
    draw.beginPath();
    for (let j = 0; j < poly.sides; j++) {
      const angle = poly.rotation + (j / poly.sides) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * poly.radius;
      const y = center[1] + Math.sin(angle) * poly.radius;
      if (j === 0) {
        draw.moveTo(x, y);
      } else {
        draw.lineTo(x, y);
      }
    }
    draw.closePath();
    draw.fill();

    draw.strokeStyle = [poly.strokeColor[0], poly.strokeColor[1], poly.strokeColor[2], poly.strokeColor[3] * opacity];
    draw.lineWidth = 2;
    draw.beginPath();
    for (let j = 0; j < poly.sides; j++) {
      const angle = poly.rotation + (j / poly.sides) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * poly.radius;
      const y = center[1] + Math.sin(angle) * poly.radius;
      if (j === 0) {
        draw.moveTo(x, y);
      } else {
        draw.lineTo(x, y);
      }
    }
    draw.closePath();
    draw.stroke();
  }

  // Spawn new polygons
  while (animatedPolygons.length < MAX_ANIMATED_POLYGONS) {
    animatedPolygons.push(createAnimatedPolygon());
  }

  // --- Animated Points ---
  const t = animationTime;

  for (const p of animatedPoints) {
    // Update position based on animation type
    if (p.animationType === "orbit") {
      const angle = p.orbitPhase + t * p.orbitSpeed;
      p.x = p.orbitCenterX + Math.cos(angle) * p.orbitRadius;
      p.y = p.orbitCenterY + Math.sin(angle) * p.orbitRadius;
    } else if (p.animationType === "wander") {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX) {
        p.vx *= -1;
        p.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x));
      }
      if (p.y < BOUNDS.minY || p.y > BOUNDS.maxY) {
        p.vy *= -1;
        p.y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, p.y));
      }
    } else if (p.animationType === "pulse") {
      p.size = p.baseSize * (1 + 0.3 * Math.sin(t * p.pulseSpeed + p.pulsePhase));
    }

    p.rotation += p.rotationSpeed * dt;

    // Draw the point
    draw.fillStyle = p.color;
    drawShape(p.x, p.y, p.size, p.shape, p.rotation);
  }

  draw.end();

  // Request next frame
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
console.log("All rendering now uses immediate mode API!");
