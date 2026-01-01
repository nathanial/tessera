# Tessera Roadmap

## Phase 1: Core Foundation ✅

- [x] **Tessera Class** - WebGL2 context management and render loop
- [x] **Shader System** - Compile, link, and uniform management
- [x] **Matrix Utilities** - 3x3 transform matrices for 2D (translate, rotate, scale)
- [x] **Viewport & Camera** - Pan/zoom with matrix uniforms
- [x] **Tile Rendering** - Raster tile loading with retina support (Carto Voyager @2x)
- [x] **Buffer Management** - Vertex/index buffer abstraction with VRAM lifecycle

## Phase 2: Geometry Pipeline ✅

- [x] **Polygon Tessellation** - Ear-clipping algorithm for GeoJSON polygons (using earcut)
- [x] **Polyline Extrusion** - Triangle ribbon generation from line coordinates
- [x] **Join Styles** - Miter joins for polylines (bevel/round planned for later)
- [x] **Cap Styles** - Butt, square, and round caps
- [x] **Screen-Space Line Widths** - Pixel-perfect widths at any zoom

## Phase 3: Rendering Features ✅

- [x] **Batch Renderer** - Group draw calls by style/shader
- [x] **Style System** - Fill, stroke, opacity, z-index, blend modes
- [x] **Instanced Rendering** - Efficient point/marker rendering (circle, square, triangle, diamond)
- [x] **SDF Text** - Signed Distance Field text rendering
- [x] **SDF Icons** - Crisp icons at any scale

## Phase 4: Coordinate Systems (In Progress)

- [x] **Projection Support** - Web Mercator (EPSG:3857) with lngLatToWorld/worldToLngLat
- [x] **Tile Coordinate Utilities** - worldToTile, worldToTileRelative, tileRelativeToWorld
- [x] **Tile Clipping** - Sutherland-Hodgman (polygons) and Cohen-Sutherland (lines)
- [x] **Tile-Relative Matrix** - Camera.getTileRelativeMatrix() for precision-preserving transforms
- [ ] **Tile-Relative Geometry** - Per-tile geometry storage in FeatureRenderer
- [ ] **Precision Handling** - Full integration to solve vertex jitter at zoom 19

## Phase 5: Interactivity

- [ ] **Hit Testing** - GPU-based feature picking
- [ ] **Event System** - Click, hover, drag events on features
- [ ] **Animation** - Smooth transitions for camera and styles

## Future Considerations

- Vector tile parsing (MVT format)
- Custom shader injection
- WebGPU backend
- Worker-based tessellation
