# Tessera Codebase Inventory

Date: 2026-01-07

## High-level map

- `src/` — library source (core renderer, geometry pipeline, batching, instancing, SDF text/icons, immediate-mode drawing, UI widgets).
- `dev/` — demo app + experimental/rendering prototypes; includes its own tests and utilities.
- `dist/`, `dist-demo/` — build outputs (ignored by `.gitignore` but present in working tree).
- `node_modules/` — dependencies (ignored by `.gitignore` but present in working tree).
- `README.md`, `ROADMAP.md` — project docs.
- `vitest.config.ts`, `vite.config.ts`, `tsup.config.ts`, `tsconfig.json` — build/test tooling.

## Key entry points / public API

- `src/index.ts` — export surface.
- `src/Tessera.ts` — main map/tile renderer; owns `Camera`, `TileManager`, draw loop, and immediate-mode contexts.
- `src/FeatureRenderer.ts` — GeoJSON renderer (fill + stroke) with style support.
- `src/batch/` — batching system for fill/stroke geometry (`BatchRenderer`, `BatchGroup`, `BatchKey`).
- `src/geometry/` — polygon tessellation + polyline extrusion (earcut + custom extruder).
- `src/immediate/` — Canvas2D-like API (`DrawContext`, `PathBuilder`, `DynamicBuffer`).
- `src/instanced/` — instanced point renderer and shape generators.
- `src/sdf/` — SDF text/icon rendering pipeline + atlas tooling.
- `src/ui/` — immediate-mode UI widgets on top of `DrawContext` and `SDFRenderer`.

## Tests

- Library tests in `src/**/*.test.ts` (geometry, buffer, camera, SDF).
- Demo/experimental tests in `dev/**/*.test.ts` (selection, convex hull, panes, labels).
- `vitest.config.ts` includes both `src` and `dev` tests in the default test run.

## Findings: cleanup/refactor/duplication

### 1) Duplicated geometry logic

- **Extrusion duplication**: `src/geometry/extrude.ts` and `src/immediate/PathBuilder.ts` both implement very similar polyline extrusion logic (normals, miters, caps). This risks divergence and bugs. Consider extracting a shared helper (e.g., `src/geometry/extrudePolyline.ts`) and reuse in both places.
- **Tessellation duplication**: `PathBuilder.tessellate()` re-implements earcut flattening and merging logic already present in `src/geometry/tessellate.ts`. Consider reusing `tessellatePolygon()` for each subpath or moving a shared “merge tessellations” helper into `src/geometry/`.

### 2) Shader/program setup repeated across renderers

Multiple renderers compile the same shaders and repeat uniform/attribute lookups:
- `src/FeatureRenderer.ts`, `src/batch/BatchRenderer.ts`, `src/immediate/FillRenderer.ts`, `src/immediate/StrokeRenderer.ts`, `src/Tessera.ts`, `src/instanced/InstancedPointRenderer.ts`, `src/sdf/SDFRenderer.ts`.

Consider a shared `ProgramCache` or `ShaderBundle` utility to:
- Compile once per `WebGL2RenderingContext`.
- Centralize uniform/attrib location caching.
- Reduce boilerplate and risk of mismatched names.

### 3) Type duplication + cross-module coupling

- `Color` is defined in multiple places: `src/FeatureRenderer.ts`, `src/immediate/DrawState.ts`, `src/ui/UITheme.ts`, and is imported from `FeatureRenderer` inside `src/style/types.ts` and `src/sdf/types.ts`. This creates unnecessary coupling and a circular type dependency (`FeatureRenderer` ⇄ `style`).
- `LineCap`/`LineJoin` exist in `DrawState` while similar `CapStyle`/`JoinStyle` exist in `src/geometry/types.ts`.

Suggestion: create a small `src/types/` module (e.g., `src/types/color.ts`, `src/types/geojson.ts`, `src/types/line.ts`) and have all systems share those base types.

### 4) Unused or partially-implemented API surface

- `ExtrudeOptions.join` and `JoinStyle` in `src/geometry/types.ts` are defined but not used in `src/geometry/extrude.ts`.
- `DrawState.lineJoin` is tracked but never influences stroke geometry (`PathBuilder.extrude()` only supports miter joins).

Recommendation: either implement join styles or remove the unused options to avoid misleading API.

### 5) Shared constants duplicated

- Tile size constant exists in both `src/Camera.ts` and `src/TileManager.ts` (`TILE_SIZE = 512`).
- View-size math is repeated in `Camera.getMatrix()`, `Camera.getVisibleBounds()`, and `TileManager.getVisibleTiles()`.

Recommendation: move tile-size and view-math helpers into a shared module to prevent drift.

### 6) Rendering loop duplication

- `Tessera.render()` and `Tessera.renderTiles()` repeat very similar tile render code. Consider extracting a shared private helper with a small surface area for debug logging, and reuse in both methods.

### 7) Debug logging in production path

- `src/Tessera.ts` logs per-second frame stats and tile details with `console.log()`. If this is not intended for library consumers, gate behind a debug flag or injectable logger.
- `src/TileManager.ts` logs `console.error()` on load failure; consider routing errors to a callback for downstream handling.

### 8) Instanced point renderer inefficiency

- `src/instanced/InstancedPointRenderer.ts` calls `createShapeGeometry()` twice in `setInstances()` and re-runs VAO setup even when shape is unchanged. Cache the geometry result and reuse it.

### 9) UI widget interaction logic repeated

- Widgets like `Button`, `ToggleButton`, `Scrollbar`, and `TabArea` each hand-roll hover/active logic and hit tests. Consider extracting a small shared helper (e.g., `usePressable`, `useHover`, `hitTest`) to reduce repetition and unify behavior.

### 10) Dev/demo code separation

- `dev/` contains a large amount of prototype logic and utilities (selection, labels, sensor cones, spatial grids, etc.). Decide whether these are:
  - part of the library (move into `src/`), or
  - demo-only (rename to `examples/` and consider excluding from tests/build).

## Quick inventory of major modules (by responsibility)

- **Core renderer**: `src/Tessera.ts`, `src/Camera.ts`, `src/TileManager.ts`.
- **Geometry & math**: `src/geometry/*`, `src/math/*`, `src/geo/*`.
- **Rendering systems**:
  - Feature-based: `src/FeatureRenderer.ts`.
  - Batch renderer: `src/batch/*`.
  - Immediate-mode: `src/immediate/*`.
  - Instanced points: `src/instanced/*`.
  - SDF text/icons: `src/sdf/*`.
- **UI system**: `src/ui/*`.

If you want, I can turn any of these findings into concrete refactor PRs (e.g., shared `Color` type, shader cache, or unified extrusion helpers).
