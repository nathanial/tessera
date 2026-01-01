# Tessera Roadmap

An interactive map viewer with game-style graphics and animations.

---

## Phase 0: Immediate Mode API

**Goal: Simple, canvas-like drawing API**

The foundation layer that all visualization is built on. Familiar API inspired by Canvas 2D, but GPU-accelerated.

- [x] **DrawContext Class** - Main immediate-mode API entry point
- [x] **State Management** - fillStyle, strokeStyle, lineWidth, lineCap, lineJoin
- [x] **State Stack** - save()/restore() for nested state changes
- [x] **Primitives** - fillRect, strokeRect, fillCircle, strokeCircle
- [x] **Path API** - beginPath, moveTo, lineTo, arc, closePath, fill, stroke
- [ ] **Text** - fillText, strokeText with font settings
- [x] **GeoJSON Helpers** - fillGeoJSON, strokeGeoJSON for easy geo rendering
- [x] **Dynamic Batching** - Accumulate commands, flush once per frame
- [ ] **Coordinate Modes** - Screen pixels vs world coordinates

```typescript
const draw = tessera.createDrawContext();
draw.begin();
draw.fillStyle = [1, 0, 0, 1];
draw.fillRect(100, 100, 200, 150);
draw.strokeCircle(300, 300, 50);
draw.end();
```

---

## Phase 1: Game-Style Visuals

**Goal: Stand out from boring map libraries**

- [ ] **Gradient Fills** - Linear and radial gradients for polygons
- [ ] **Glow Effects** - Bloom/glow post-processing for neon aesthetics
- [ ] **Animated Lines** - Marching ants, flowing dashes, pulse effects
- [ ] **Particle System** - Weather, explosions, ambient effects
- [ ] **Lighting** - Day/night cycle, dynamic shadows, spotlights
- [ ] **Pattern Fills** - Hatching, dots, custom textures
- [ ] **Outlines & Halos** - Crisp outlines around features

---

## Phase 2: Interactivity

**Goal: Rich user interaction**

- [ ] **Hit Testing** - GPU picking or spatial index for feature detection
- [ ] **Hover States** - Highlight features on mouseover with smooth transitions
- [ ] **Selection System** - Click to select, multi-select, selection styling
- [ ] **Tooltips** - Floating info panels on hover/click
- [ ] **Cursor Feedback** - Change cursor on interactive features
- [ ] **Event System** - onClick, onHover, onSelect callbacks per feature

---

## Phase 3: Animation System

**Goal: Buttery smooth motion**

- [ ] **Property Animation** - Animate color, position, scale, opacity, rotation
- [ ] **Easing Library** - ease-in, ease-out, bounce, elastic, custom curves
- [ ] **Timeline/Sequencer** - Choreograph multi-step animations
- [ ] **Camera Flights** - Smooth animated transitions between locations
- [ ] **Sprite Animation** - Frame-by-frame sprite sheets for icons
- [ ] **Morph Transitions** - Animate between different geometries

---

## Phase 4: Scale & Performance

**Goal: Handle massive datasets**

- [ ] **Spatial Indexing** - R-tree for efficient culling and queries
- [ ] **Level of Detail** - Simplify geometries at low zoom levels
- [ ] **Streaming Data** - Progressive loading of large GeoJSON
- [ ] **Vector Tiles** - MVT format parsing and rendering
- [ ] **Web Workers** - Offload tessellation to background threads
- [ ] **GPU Culling** - Shader-based frustum culling

---

## Ideas Backlog

Things to explore if time permits:

- Fog of war / reveal effects
- Procedural terrain or noise-based effects
- Shader hot-reload for rapid iteration
- Water ripple effects
- Heat distortion
- Screen-space reflections
- Minimap widget
