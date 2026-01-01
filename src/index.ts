/**
 * Tessera - A zero-dependency, hardware-accelerated 2D vector rendering engine
 */

export const VERSION = "0.0.1";

export { Tessera, type TesseraOptions } from "./Tessera";
export { Camera } from "./Camera";
export { TileManager, type TileCoord, type LoadedTile } from "./TileManager";
export { Buffer, type BufferTarget, type BufferUsage } from "./Buffer";
export { Geometry, type AttributeLayout, type GeometryOptions } from "./Geometry";
export * as mat3 from "./math/mat3";
