/**
 * Tessera - A zero-dependency, hardware-accelerated 2D vector rendering engine
 */

export const VERSION = "0.0.1";

export { Tessera, type TesseraOptions } from "./Tessera";
export { Camera } from "./Camera";
export { TileManager, type TileCoord, type LoadedTile } from "./TileManager";
export * as mat3 from "./math/mat3";
