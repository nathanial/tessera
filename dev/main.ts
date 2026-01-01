import { Tessera, DrawContext, VERSION } from "../src/index";

console.log(`Tessera v${VERSION}`);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create immediate mode draw context
const draw = tessera.createDrawContext();

// ============================================
// GRID CONFIGURATION
// ============================================

// Grid layout in world coordinates (0-1 range)
const GRID = {
  startX: 0.23,
  startY: 0.35,
  cellWidth: 0.0008,
  cellHeight: 0.0008,
  cols: 20,
  rows: 20,
};

// Shape size
const SHAPE_SIZE = 0.00025;

// ============================================
// SHAPE DATA
// ============================================

type ShapeType = "circle" | "square" | "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star";

interface GridShape {
  row: number;
  col: number;
  shape: ShapeType;
  baseColor: [number, number, number];
  strokeWidth: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  colorPhase: number;
  colorSpeed: number;
  opacityPhase: number;
  opacitySpeed: number;
}

const shapes: GridShape[] = [];

// Color palettes for each shape type
const palettes: Record<ShapeType, [number, number, number][]> = {
  circle: [[0.3, 0.5, 0.9], [0.2, 0.4, 0.8], [0.4, 0.6, 1.0], [0.1, 0.3, 0.7]],
  square: [[0.9, 0.3, 0.3], [0.8, 0.2, 0.2], [1.0, 0.4, 0.4], [0.7, 0.1, 0.1]],
  triangle: [[0.2, 0.8, 0.5], [0.1, 0.7, 0.4], [0.3, 0.9, 0.6], [0.0, 0.6, 0.3]],
  diamond: [[0.9, 0.7, 0.2], [0.8, 0.6, 0.1], [1.0, 0.8, 0.3], [0.7, 0.5, 0.0]],
  pentagon: [[0.7, 0.3, 0.9], [0.6, 0.2, 0.8], [0.8, 0.4, 1.0], [0.5, 0.1, 0.7]],
  hexagon: [[0.9, 0.5, 0.7], [0.8, 0.4, 0.6], [1.0, 0.6, 0.8], [0.7, 0.3, 0.5]],
  octagon: [[0.2, 0.7, 0.7], [0.1, 0.6, 0.6], [0.3, 0.8, 0.8], [0.0, 0.5, 0.5]],
  star: [[0.95, 0.8, 0.2], [0.9, 0.7, 0.1], [1.0, 0.9, 0.3], [0.85, 0.6, 0.0]],
};

const shapeTypes: ShapeType[] = ["circle", "square", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star"];

// Generate grid of shapes
for (let row = 0; row < GRID.rows; row++) {
  for (let col = 0; col < GRID.cols; col++) {
    // Alternate shape types in a pattern
    const shapeIndex = (row + col) % shapeTypes.length;
    const shapeType = shapeTypes[shapeIndex]!;

    // Pick color from palette
    const palette = palettes[shapeType];
    const colorIndex = (row * GRID.cols + col) % palette.length;
    const baseColor = palette[colorIndex]!;

    // Vary size slightly
    const sizeVariation = 0.7 + ((row * col) % 5) * 0.1;

    // Vary rotation speed - some fast, some slow, some negative
    const speedVariation = ((row * 7 + col * 13) % 10) / 10; // 0 to 0.9
    const direction = ((row + col) % 2 === 0) ? 1 : -1;
    const rotationSpeed = direction * (0.5 + speedVariation * 1.5); // 0.5 to 2.0 rad/s

    // Color and opacity animation
    const colorPhase = ((row * 3 + col * 5) % 17) / 17 * Math.PI * 2;
    const colorSpeed = 0.3 + ((row * 11 + col * 7) % 10) / 10 * 0.7; // 0.3 to 1.0
    const opacityPhase = ((row * 5 + col * 11) % 13) / 13 * Math.PI * 2;
    const opacitySpeed = 0.5 + ((row * 13 + col * 3) % 10) / 10 * 1.0; // 0.5 to 1.5

    shapes.push({
      row,
      col,
      shape: shapeType,
      baseColor,
      strokeWidth: 2,
      size: SHAPE_SIZE * sizeVariation,
      rotation: 0,
      rotationSpeed,
      colorPhase,
      colorSpeed,
      opacityPhase,
      opacitySpeed,
    });
  }
}

console.log(`Created ${shapes.length} shapes in a ${GRID.cols}x${GRID.rows} grid`);

// ============================================
// DRAWING FUNCTIONS
// ============================================

function drawShape(
  cx: number,
  cy: number,
  size: number,
  shape: ShapeType,
  rotation: number,
  fill: boolean = true
) {
  if (shape === "circle") {
    // Circles don't rotate visually, but we still draw them
    draw.beginPath();
    draw.arc(cx, cy, size, 0, Math.PI * 2);
    if (fill) {
      draw.fill();
    } else {
      draw.stroke();
    }
  } else if (shape === "star") {
    // 5-pointed star
    const outerRadius = size;
    const innerRadius = size * 0.4;
    const points = 5;

    draw.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = rotation + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) {
        draw.moveTo(x, y);
      } else {
        draw.lineTo(x, y);
      }
    }
    draw.closePath();
    if (fill) {
      draw.fill();
    } else {
      draw.stroke();
    }
  } else {
    // Regular polygons
    let sides: number;
    let angleOffset = 0;

    switch (shape) {
      case "triangle":
        sides = 3;
        angleOffset = -Math.PI / 2; // Point up
        break;
      case "square":
        sides = 4;
        angleOffset = Math.PI / 4; // Flat on bottom
        break;
      case "diamond":
        sides = 4;
        angleOffset = 0; // Point on bottom
        break;
      case "pentagon":
        sides = 5;
        angleOffset = -Math.PI / 2;
        break;
      case "hexagon":
        sides = 6;
        angleOffset = 0;
        break;
      case "octagon":
        sides = 8;
        angleOffset = Math.PI / 8;
        break;
      default:
        sides = 4;
    }

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
    if (fill) {
      draw.fill();
    } else {
      draw.stroke();
    }
  }
}

function getShapeCenter(row: number, col: number): [number, number] {
  const x = GRID.startX + col * GRID.cellWidth + GRID.cellWidth / 2;
  const y = GRID.startY + row * GRID.cellHeight + GRID.cellHeight / 2;
  return [x, y];
}

// ============================================
// MAIN RENDER LOOP
// ============================================

// Start centered on the grid
const gridCenterX = GRID.startX + (GRID.cols * GRID.cellWidth) / 2;
const gridCenterY = GRID.startY + (GRID.rows * GRID.cellHeight) / 2;
tessera.camera.centerX = gridCenterX;
tessera.camera.centerY = gridCenterY;
tessera.camera.zoom = 10;

let lastTime = performance.now();
let elapsedTime = 0;

const originalRender = tessera.render.bind(tessera);
tessera.render = function () {
  // Calculate delta time
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  elapsedTime += dt;

  // Update rotations
  for (const shape of shapes) {
    shape.rotation += shape.rotationSpeed * dt;
  }

  // Render tiles first
  originalRender();

  const matrix = this.camera.getMatrix(this.canvas.width, this.canvas.height);
  const w = this.canvas.width;
  const h = this.canvas.height;

  // ============================================
  // ALL IMMEDIATE MODE DRAWING
  // ============================================
  draw.begin(matrix, w, h);

  // Draw all shapes in grid
  for (const shape of shapes) {
    const [cx, cy] = getShapeCenter(shape.row, shape.col);

    // Animate color - shift hue by cycling through RGB
    const colorT = elapsedTime * shape.colorSpeed + shape.colorPhase;
    const colorShift = Math.sin(colorT) * 0.3; // -0.3 to +0.3
    const r = Math.max(0, Math.min(1, shape.baseColor[0] + colorShift));
    const g = Math.max(0, Math.min(1, shape.baseColor[1] + Math.sin(colorT + 2) * 0.2));
    const b = Math.max(0, Math.min(1, shape.baseColor[2] - colorShift));

    // Animate opacity
    const opacityT = elapsedTime * shape.opacitySpeed + shape.opacityPhase;
    const opacity = 0.4 + Math.sin(opacityT) * 0.3; // 0.1 to 0.7

    // Fill
    draw.fillStyle = [r, g, b, opacity];
    drawShape(cx, cy, shape.size, shape.shape, shape.rotation, true);

    // Stroke (darker, more opaque)
    draw.strokeStyle = [r * 0.6, g * 0.6, b * 0.6, Math.min(1, opacity + 0.4)];
    draw.lineWidth = shape.strokeWidth;
    drawShape(cx, cy, shape.size, shape.shape, shape.rotation, false);
  }

  draw.end();

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
