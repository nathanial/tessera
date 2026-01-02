# Label Placement Plan (No Overlaps)

## Goals
- Never allow label/callout overlap on screen.
- Support thousands of moving labels with stable, low-jitter placement.
- Allow hiding only as a last resort, with a visible indicator.

## High-level approach
1. Treat every label/callout as a screen-space rectangle with padding.
2. Use a spatial hash grid to keep overlap checks near O(1).
3. Place in priority order with a bounded set of candidate positions per label.
4. For dense clusters or failed placements, collapse into callouts.
5. If a callout cannot be placed, show a compact “+N hidden” indicator and track hidden counts.

## Placement pipeline
1. **Direct placement**
   - Try the preferred offset from anchor.
   - If no overlap, lock it in and insert its bounds into the grid.

2. **Cluster displaced anchors**
   - Bucket by screen-space cells (anchored to world grid for stability).
   - Use hysteresis to reduce cluster flipping.

3. **Leader placement (small clusters)**
   - For clusters below the callout threshold, try a bounded list of candidate offsets.
   - Use multiple rings (increasing radius) and 8 directions.
   - Keep the previous candidate index first to reduce jitter.

4. **Callouts (dense clusters or placement failures)**
   - For clusters above threshold or any unplaced labels, create a stacked callout.
   - Callout size is derived from text widths + padding.
   - Attempt positions around the centroid, then fall back to a coarse grid scan.
   - If no free slot exists, count as hidden and expose a “+N hidden” indicator.

## Performance safeguards
- Candidate list bounded (e.g., 24–32 positions per label).
- Spatial grid used for all overlap checks.
- Callout scan uses coarse step = grid cell size.
- All computations are per-frame and avoid O(n^2).

## Tests
- No-overlap invariant across direct labels, leader labels, and callouts.
- Hidden indicator triggered when space is insufficient.
- Dense cluster leads to callout placement without overlaps.
