import {
  Tessera,
  FeatureRenderer,
  InstancedPointRenderer,
  SDFRenderer,
  createFontAtlas,
  lngLatToWorldArray,
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
 * Convert a GeoJSON coordinate array from WGS84 to world space
 */
function convertCoords(coords: number[][]): number[][] {
  return coords.map(([lng, lat]) => lngLatToWorldArray(lng!, lat!));
}

// ============================================
// POLYGONS - Various neighborhoods and areas
// ============================================

// Small polygon size ~0.005 degrees ≈ 500m
const S = 0.005;

// Financial District - Downtown SF (blue)
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.400, 37.792],
      [-122.400 + S, 37.792],
      [-122.400 + S, 37.792 - S],
      [-122.400, 37.792 - S],
      [-122.400, 37.792],
    ]),
  ],
}, {
  fillColor: [0.2, 0.4, 0.9, 0.5],
  strokeColor: [0.1, 0.2, 0.6, 1.0],
  strokeWidth: 3,
  zIndex: 1,
});

// Oakland Downtown (purple) - East Bay
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.275, 37.805],
      [-122.275 + S, 37.805],
      [-122.275 + S, 37.805 - S],
      [-122.275, 37.805 - S],
      [-122.275, 37.805],
    ]),
  ],
}, {
  fillColor: [0.6, 0.2, 0.8, 0.5],
  strokeColor: [0.4, 0.1, 0.5, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Berkeley (orange) - North East Bay
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.272, 37.872],
      [-122.272 + S, 37.872],
      [-122.272 + S, 37.872 - S],
      [-122.272, 37.872 - S],
      [-122.272, 37.872],
    ]),
  ],
}, {
  fillColor: [0.95, 0.5, 0.1, 0.5],
  strokeColor: [0.7, 0.3, 0.0, 1.0],
  strokeWidth: 3,
  zIndex: 2,
});

// Golden Gate Park (green with lake hole) - West SF
const parkW = 0.015;
const parkH = 0.004;
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.480, 37.770],
      [-122.480 + parkW, 37.770],
      [-122.480 + parkW, 37.770 - parkH],
      [-122.480, 37.770 - parkH],
      [-122.480, 37.770],
    ]),
    // Inner hole (lake)
    convertCoords([
      [-122.475, 37.769],
      [-122.470, 37.769],
      [-122.470, 37.767],
      [-122.475, 37.767],
      [-122.475, 37.769],
    ]),
  ],
}, {
  fillColor: [0.2, 0.7, 0.3, 0.5],
  strokeColor: [0.1, 0.5, 0.2, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Sausalito (teal) - North of Golden Gate
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.482, 37.858],
      [-122.482 + S, 37.858],
      [-122.482 + S, 37.858 - S],
      [-122.482, 37.858 - S],
      [-122.482, 37.858],
    ]),
  ],
}, {
  fillColor: [0.1, 0.7, 0.7, 0.5],
  strokeColor: [0.0, 0.5, 0.5, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Daly City (dark green) - South of SF
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.465, 37.690],
      [-122.465 + S, 37.690],
      [-122.465 + S, 37.690 - S],
      [-122.465, 37.690 - S],
      [-122.465, 37.690],
    ]),
  ],
}, {
  fillColor: [0.1, 0.4, 0.2, 0.5],
  strokeColor: [0.05, 0.3, 0.1, 1.0],
  strokeWidth: 2,
  zIndex: 0,
});

// Alameda (red) - East Bay island
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.265, 37.768],
      [-122.265 + S * 1.5, 37.768],
      [-122.265 + S * 1.5, 37.768 - S * 0.7],
      [-122.265, 37.768 - S * 0.7],
      [-122.265, 37.768],
    ]),
  ],
}, {
  fillColor: [0.9, 0.2, 0.2, 0.5],
  strokeColor: [0.7, 0.1, 0.1, 1.0],
  strokeWidth: 2,
  zIndex: 1,
});

// Treasure Island (gold) - In the bay
featureRenderer.addFeature({
  type: "Polygon" as const,
  coordinates: [
    convertCoords([
      [-122.373, 37.822],
      [-122.373 + S * 0.8, 37.822],
      [-122.373 + S * 0.8, 37.822 - S * 0.6],
      [-122.373, 37.822 - S * 0.6],
      [-122.373, 37.822],
    ]),
  ],
}, {
  fillColor: [0.9, 0.75, 0.1, 0.5],
  strokeColor: [0.7, 0.55, 0.0, 1.0],
  strokeWidth: 2,
  zIndex: 2,
});

// STRESS TEST: Generate 200 random polygons across Bay Area
for (let i = 0; i < 200; i++) {
  const centerLng = -122.55 + Math.random() * 0.35;
  const centerLat = 37.68 + Math.random() * 0.25;
  const size = 0.002 + Math.random() * 0.004;
  const sides = 3 + Math.floor(Math.random() * 6);
  const rotation = Math.random() * Math.PI * 2;

  // Generate polygon vertices
  const coords: number[][] = [];
  for (let j = 0; j <= sides; j++) {
    const angle = rotation + (j / sides) * Math.PI * 2;
    coords.push([
      centerLng + Math.cos(angle) * size,
      centerLat + Math.sin(angle) * size * 0.8,
    ]);
  }

  // Random color
  const hue = Math.random();
  const r = Math.abs(Math.sin(hue * Math.PI * 2)) * 0.7 + 0.3;
  const g = Math.abs(Math.sin((hue + 0.33) * Math.PI * 2)) * 0.7 + 0.3;
  const b = Math.abs(Math.sin((hue + 0.66) * Math.PI * 2)) * 0.7 + 0.3;

  featureRenderer.addFeature({
    type: "Polygon" as const,
    coordinates: [convertCoords(coords)],
  }, {
    fillColor: [r, g, b, 0.3 + Math.random() * 0.3],
    strokeColor: [r * 0.7, g * 0.7, b * 0.7, 0.8],
    strokeWidth: 1 + Math.random() * 2,
    zIndex: Math.floor(Math.random() * 5),
  });
}

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

// STRESS TEST: Generate 300 random lines across Bay Area
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

  // Random color
  const hue = Math.random();
  const r = Math.abs(Math.sin(hue * Math.PI * 2)) * 0.8 + 0.2;
  const g = Math.abs(Math.sin((hue + 0.33) * Math.PI * 2)) * 0.8 + 0.2;
  const b = Math.abs(Math.sin((hue + 0.66) * Math.PI * 2)) * 0.8 + 0.2;

  const caps: Array<"butt" | "round" | "square"> = ["butt", "round", "square"];

  featureRenderer.addFeature({
    type: "LineString" as const,
    coordinates: convertCoords(coords),
  }, {
    strokeColor: [r, g, b, 0.6 + Math.random() * 0.4],
    strokeWidth: 1 + Math.random() * 4,
    strokeCap: caps[Math.floor(Math.random() * 3)],
    zIndex: Math.floor(Math.random() * 5),
  });
}

console.log(`Added ${featureRenderer.featureCount} GeoJSON features`);

// ============================================
// SDF TEXT LABELS
// ============================================

const sdfRenderer = new SDFRenderer(tessera.gl);

// Generate font atlas at runtime (uses 64px base size, 1024px atlas)
const fontAtlas = createFontAtlas({
  fontFamily: "Arial, Helvetica, sans-serif",
});

// Store label data for animation
interface LabelData {
  text: string;
  x: number;
  y: number;
  size: number;
  color: [number, number, number, number];
  rotationSpeed: number;
}
const allLabels: LabelData[] = [];
let textRotationTime = 0;

// Wait for font atlas to load, then add text labels
let textReady = false;
fontAtlas.ready.then(() => {
  sdfRenderer.loadFontAtlas(fontAtlas.metadata, fontAtlas.image);

  // Area labels matching the spread-out polygons
  const labels: Array<{ text: string; lng: number; lat: number; size: number; color: [number, number, number, number] }> = [
    // SF areas
    { text: "Financial District", lng: -122.400, lat: 37.790, size: 24, color: [0.1, 0.2, 0.5, 1] },
    { text: "Golden Gate Park", lng: -122.480, lat: 37.770, size: 22, color: [0.1, 0.4, 0.1, 1] },
    // East Bay
    { text: "Oakland", lng: -122.270, lat: 37.802, size: 28, color: [0.4, 0.1, 0.5, 1] },
    { text: "Berkeley", lng: -122.270, lat: 37.870, size: 28, color: [0.6, 0.3, 0.0, 1] },
    { text: "Alameda", lng: -122.260, lat: 37.767, size: 24, color: [0.7, 0.1, 0.1, 1] },
    // North Bay
    { text: "Sausalito", lng: -122.482, lat: 37.855, size: 24, color: [0.0, 0.4, 0.4, 1] },
    // South Bay
    { text: "Daly City", lng: -122.460, lat: 37.682, size: 24, color: [0.05, 0.25, 0.1, 1] },
    // Islands
    { text: "Treasure Island", lng: -122.367, lat: 37.820, size: 20, color: [0.6, 0.45, 0.0, 1] },
    // Main title
    { text: "San Francisco Bay Area", lng: -122.38, lat: 37.82, size: 36, color: [0.2, 0.2, 0.2, 1] },
  ];

  // STRESS TEST: Generate 200 random text labels
  const words = ["Point", "Area", "Zone", "District", "Park", "Place", "Center", "Square", "Plaza", "Station", "Terminal", "Market", "Harbor", "Beach", "Hill", "Valley", "Creek", "Lake", "Bay", "Cove"];
  const prefixes = ["North", "South", "East", "West", "Upper", "Lower", "Old", "New", "Grand", "Little", "Big", "Green", "Blue", "Red", "Golden", "Silver", "Crystal", "Sunny", "Happy", "Lucky"];

  for (let i = 0; i < 200; i++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const word = words[Math.floor(Math.random() * words.length)];
    const text = `${prefix} ${word}`;

    const lng = -122.55 + Math.random() * 0.35;
    const lat = 37.68 + Math.random() * 0.25;
    const size = 16 + Math.random() * 18;

    const hue = Math.random();
    const r = Math.abs(Math.sin(hue * Math.PI * 2)) * 0.5 + 0.2;
    const g = Math.abs(Math.sin((hue + 0.33) * Math.PI * 2)) * 0.5 + 0.2;
    const b = Math.abs(Math.sin((hue + 0.66) * Math.PI * 2)) * 0.5 + 0.2;

    labels.push({ text, lng, lat, size, color: [r, g, b, 1] });
  }

  // Store labels for animated rotation
  for (const label of labels) {
    const [x, y] = lngLatToWorldArray(label.lng, label.lat);
    allLabels.push({
      text: label.text,
      x,
      y,
      size: label.size,
      color: label.color,
      rotationSpeed: (Math.random() - 0.5) * 0.3, // Random rotation speed
    });
  }

  textReady = true;
  console.log(`Added ${labels.length} text labels (animated rotation)`);
});

// ============================================
// INSTANCED POINTS - Multiple shape types
// ============================================

// Create separate renderers for each shape type
const circleRenderer = new InstancedPointRenderer(tessera.gl);
const squareRenderer = new InstancedPointRenderer(tessera.gl);
const triangleRenderer = new InstancedPointRenderer(tessera.gl);
const diamondRenderer = new InstancedPointRenderer(tessera.gl);

// Bay Area center for animations
const bayAreaCenter = lngLatToWorldArray(-122.38, 37.82);

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
  const center = lngLatToWorldArray(centerLng, centerLat);
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
      // Velocity for wandering - slower drift
      vx: (Math.random() - 0.5) * 0.000005,
      vy: (Math.random() - 0.5) * 0.000005,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      // Orbit parameters - varied orbits, slow rotation
      orbitCenterX: center[0],
      orbitCenterY: center[1],
      orbitRadius: 0.00005 + Math.random() * 0.0006,
      orbitSpeed: 0.05 + Math.random() * 0.25,
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

// STRESS TEST: Massive number of instanced points
let circlePoints = generateAnimatedPoints(-122.40, 37.79, 5000, 0.004, [0.3, 0.5, 0.9], [4, 12], "orbit");     // SF
let squarePoints = generateAnimatedPoints(-122.27, 37.80, 5000, 0.004, [0.9, 0.3, 0.3], [4, 10], "orbit");     // Oakland
let trianglePoints = generateAnimatedPoints(-122.27, 37.87, 5000, 0.004, [0.2, 0.8, 0.7], [5, 12], "pulse");   // Berkeley
let diamondPoints = generateAnimatedPoints(-122.48, 37.85, 5000, 0.004, [0.95, 0.7, 0.2], [5, 11], "orbit");   // Marin

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
const MAX_ANIMATED_POLYGONS = 100;  // STRESS TEST: 100 animated polygons

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

  // Spawn in tighter Bay Area region
  return {
    centerLng: -122.45 + Math.random() * 0.12,  // -122.45 to -122.33
    centerLat: 37.76 + Math.random() * 0.10,    // 37.76 to 37.86
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
    // radius is in degrees, no extra scaling needed
    const lng = poly.centerLng + Math.cos(angle) * poly.radius;
    const lat = poly.centerLat + Math.sin(angle) * poly.radius;
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
// Tighter bounds for Bay Area animations
const BOUNDS = {
  minX: bayAreaCenter[0] - 0.008,
  maxX: bayAreaCenter[0] + 0.008,
  minY: bayAreaCenter[1] - 0.006,
  maxY: bayAreaCenter[1] + 0.006,
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

  // Update text rotation
  if (textReady && allLabels.length > 0) {
    textRotationTime += dt;
    sdfRenderer.clearText();
    for (const label of allLabels) {
      const rotation = textRotationTime * label.rotationSpeed;
      sdfRenderer.addText(label.text, label.x, label.y, {
        fontSize: label.size,
        color: label.color,
        align: "center",
        haloColor: [1, 1, 1, 0.8],
        haloWidth: 2,
        rotation,
      });
    }
  }
}

// Start centered on San Francisco
// SF coords: -122.42, 37.78 -> world space ~(0.16, 0.386)
const sfWorld = lngLatToWorldArray(-122.42, 37.78);
tessera.camera.centerX = sfWorld[0];
tessera.camera.centerY = sfWorld[1];
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

  // Render text labels (on top of everything)
  if (textReady) {
    sdfRenderer.render(matrix, w, h);
  }

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
