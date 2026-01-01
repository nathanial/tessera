/**
 * Batch Rendering Module
 *
 * Optimized rendering through draw call batching.
 */

export { BatchRenderer } from "./BatchRenderer";
export { BatchGroup } from "./BatchGroup";
export {
  hashColor,
  createBatchKey,
  batchKeyEquals,
  batchKeyToString,
  compareBatchKeys,
} from "./BatchKey";
export type { BatchKey, BatchableFeature, BatchRenderCommand } from "./types";
