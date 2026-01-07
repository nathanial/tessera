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

### 1) Dev/demo code separation

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
