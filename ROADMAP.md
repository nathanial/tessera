# Tessera Roadmap

## Phase 1: Core Foundation

- [ ] **Tessera Class** - WebGL2 context management and render loop
- [ ] **Buffer Management** - Vertex/index buffer abstraction with VRAM lifecycle
- [ ] **Shader System** - Compile, link, and uniform management
- [ ] **Matrix Utilities** - 3x3 transform matrices for 2D (translate, rotate, scale)
- [ ] **Viewport & Camera** - Pan/zoom with matrix uniforms

## Phase 2: Geometry Pipeline

- [ ] **Polygon Tessellation** - Ear-clipping algorithm for GeoJSON polygons
- [ ] **Polyline Extrusion** - Triangle ribbon generation from line coordinates
- [ ] **Join Styles** - Miter, bevel, and round joins for polylines
- [ ] **Cap Styles** - Butt, square, and round caps
- [ ] **Screen-Space Line Widths** - Pixel-perfect widths at any zoom

## Phase 3: Rendering Features

- [ ] **Batch Renderer** - Group draw calls by style/shader
- [ ] **Style System** - Fill, stroke, opacity, z-index
- [ ] **Instanced Rendering** - Efficient point/marker rendering
- [ ] **SDF Text** - Signed Distance Field text rendering
- [ ] **SDF Icons** - Crisp icons at any scale

## Phase 4: Coordinate Systems

- [ ] **Tile Coordinates** - Local coordinate system per tile
- [ ] **Precision Handling** - Solve vertex jitter at high zoom
- [ ] **Projection Support** - Web Mercator (EPSG:3857)

## Phase 5: Interactivity

- [ ] **Hit Testing** - GPU-based feature picking
- [ ] **Event System** - Click, hover, drag events on features
- [ ] **Animation** - Smooth transitions for camera and styles

## Future Considerations

- Vector tile parsing (MVT format)
- Custom shader injection
- WebGPU backend
- Worker-based tessellation
