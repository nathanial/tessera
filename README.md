# Tessera

A zero-dependency, hardware-accelerated 2D vector rendering engine for the web.

## Overview

Tessera is a lightweight WebGL2 renderer built from first principles for high-performance mapping and data visualization. It transforms vector data—polygons, polylines, and points—into optimized triangle meshes that live in GPU memory.

### Core Philosophy

- **Everything is a Triangle** - Polygons are ear-clipped; lines are extruded into ribbons
- **Immutable Buffers** - Geometry uploads once; motion is handled via matrix uniforms
- **Screen-Space Fidelity** - Line widths and markers remain pixel-perfect at any zoom
- **Zero Bloat** - No scene graph, no dependencies, just math and WebGL

## Installation

```bash
npm install tessera
```

## Development

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Build library
npm run build

# Type check
npm run typecheck
```

## Project Structure

```
tessera/
├── src/           # Library source
├── dev/           # Development server & examples
├── dist/          # Build output (ESM + CJS + types)
└── package.json
```

## License

MIT
