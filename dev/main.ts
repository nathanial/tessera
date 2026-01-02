/**
 * Tessera demo application entry point.
 * Renders aircraft, US state border shapes, and labels.
 */

import {
  Camera,
  SDFRenderer,
  Tessera,
  TextLayout,
  VERSION,
  createFontAtlas,
  lonLatToTessera,
} from "../src/index";
import { AircraftRenderer } from "./AircraftRenderer";
import { BorderRenderer } from "./BorderRenderer";
import { DashedLineRenderer, DashedRingRenderer } from "./DashedSelectionRenderers";
import {
  createEditableAreasState,
  renderEditableAreaHandles,
  renderEditableAreas,
  setupEditableAreasControls,
  type PaneContextProvider,
} from "./EditableAreas";
import { LabelRenderer } from "./LabelRenderer";
import {
  clampRatio,
  collectSplitters,
  computePaneRects,
  countPanes,
  createLayout,
  findPaneAt,
  splitLayout,
  type Orientation,
  type PaneRect,
  type SplitterHandle,
} from "./PaneLayout";
import { SDFCircleRenderer } from "./SDFCircleRenderer";
import { SensorConeRenderer } from "./SensorConeRenderer";
import {
  getCommandLabelStyle,
  renderCommandHulls,
  renderSelectionBox,
  renderSelectionHighlights,
} from "./SelectionRenderer";
import { normalizeRect, projectSelectionItems, selectIdsInRect, type ScreenRect } from "./SelectionUtils";
import { TrailRenderer } from "./TrailRenderer";
import { screenToWorld } from "./CoordinateUtils";
import { renderDebugGrid, renderStatsOverlay } from "./UIController";

console.log(`Tessera v${VERSION}`);

// ============================================
// INITIALIZATION
// ============================================

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const tessera = new Tessera({ canvas });

// Create immediate mode draw context
const draw = tessera.createDrawContext();

// Create SDF text renderer for aircraft labels
const sdfRenderer = new SDFRenderer(tessera.gl);

// Create renderers
const borderRenderer = new BorderRenderer();
const aircraftRenderer = new AircraftRenderer(10000); // 10k simulated aircraft
const dashedLineRenderer = new DashedLineRenderer(tessera.gl);
const commandLineRenderer = new DashedLineRenderer(tessera.gl);
const dashedRingRenderer = new DashedRingRenderer(tessera.gl);
const sensorConeRenderer = new SensorConeRenderer(tessera.gl);
const trailRenderer = new TrailRenderer(tessera.gl);
const circleRenderer = new SDFCircleRenderer(tessera.gl);

const editableAreasState = createEditableAreasState();

interface PaneState {
  id: string;
  camera: Camera;
  isZooming: boolean;
}

const ROOT_PANE_ID = "pane-0";
const MAX_PANES = 8;
let paneCounter = 1;
let layout = createLayout(ROOT_PANE_ID);
let activePaneId = ROOT_PANE_ID;

const paneStates = new Map<string, PaneState>();
const labelRenderers = new Map<string, LabelRenderer>();
let measureFn: ((text: string, fontSize: number) => number) | null = null;

const createPaneState = (id: string, sourceId?: string) => {
  const camera = new Camera();
  if (sourceId) {
    const source = paneStates.get(sourceId);
    if (source) {
      camera.centerX = source.camera.centerX;
      camera.centerY = source.camera.centerY;
      camera.zoom = source.camera.zoom;
    }
  }
  paneStates.set(id, { id, camera, isZooming: false });
};

const getLabelRenderer = (paneId: string) => {
  let renderer = labelRenderers.get(paneId);
  if (!renderer) {
    renderer = new LabelRenderer();
    if (measureFn) {
      renderer.setMeasureFunction(measureFn);
    }
    labelRenderers.set(paneId, renderer);
  }
  return renderer;
};

createPaneState(ROOT_PANE_ID);

// Start centered on the US
const usCenter = lonLatToTessera(-98, 39); // Central US (Kansas)
const rootPane = paneStates.get(ROOT_PANE_ID);
if (rootPane) {
  rootPane.camera.centerX = usCenter.x;
  rootPane.camera.centerY = usCenter.y;
  rootPane.camera.zoom = 8;
}

const layoutCache = {
  rects: new Map<string, PaneRect>(),
  splitters: [] as SplitterHandle[],
};

const SPLITTER_THICKNESS = 8;

const updateLayoutCache = () => {
  layoutCache.rects.clear();
  layoutCache.splitters = [];
  const rootRect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  computePaneRects(layout, rootRect, layoutCache.rects);
  collectSplitters(layout, rootRect, layoutCache.splitters, SPLITTER_THICKNESS);
};

const getPaneContext: PaneContextProvider = (screenX, screenY, paneId) => {
  updateLayoutCache();
  const rootRect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const targetId = paneId ?? findPaneAt(layout, rootRect, screenX, screenY);
  if (!targetId) return null;
  if (!paneId) {
    activePaneId = targetId;
  }
  const rect = layoutCache.rects.get(targetId);
  if (!rect) return null;
  const pane = paneStates.get(targetId);
  if (!pane) return null;
  const localX = screenX - rect.x;
  const localY = screenY - rect.y;
  const matrix = pane.camera.getMatrix(rect.width, rect.height);
  const bounds = pane.camera.getVisibleBounds(rect.width, rect.height);
  return {
    paneId: targetId,
    localX,
    localY,
    viewportWidth: rect.width,
    viewportHeight: rect.height,
    matrix,
    bounds,
  };
};

setupEditableAreasControls(canvas, aircraftRenderer, editableAreasState, getPaneContext, () =>
  tessera.requestRender()
);

const labelToggleButton = document.getElementById("toggle-labels") as HTMLButtonElement | null;
let showLabels = true;
if (labelToggleButton) {
  labelToggleButton.addEventListener("click", () => {
    showLabels = !showLabels;
    labelToggleButton.textContent = showLabels ? "Labels: On" : "Labels: Off";
  });
}

const groupToggleButton = document.getElementById("toggle-groups") as HTMLButtonElement | null;
let showGroups = true;
if (groupToggleButton) {
  groupToggleButton.addEventListener("click", () => {
    showGroups = !showGroups;
    groupToggleButton.textContent = showGroups ? "Groups: On" : "Groups: Off";
  });
}

const sensorToggleButton = document.getElementById("toggle-sensors") as HTMLButtonElement | null;
let showSensors = true;
if (sensorToggleButton) {
  sensorToggleButton.addEventListener("click", () => {
    showSensors = !showSensors;
    sensorToggleButton.textContent = showSensors ? "Sensors: On" : "Sensors: Off";
  });
}

const trailsToggleButton = document.getElementById("toggle-trails") as HTMLButtonElement | null;
let showTrails = true;
if (trailsToggleButton) {
  trailsToggleButton.addEventListener("click", () => {
    showTrails = !showTrails;
    trailsToggleButton.textContent = showTrails ? "Trails: On" : "Trails: Off";
  });
}

const areasToggleButton = document.getElementById("toggle-areas") as HTMLButtonElement | null;
let showAreas = true;
if (areasToggleButton) {
  areasToggleButton.addEventListener("click", () => {
    showAreas = !showAreas;
    editableAreasState.enabled = showAreas;
    if (!showAreas) {
      editableAreasState.selectedId = null;
      editableAreasState.activeHandle = null;
      editableAreasState.dragState = null;
    }
    areasToggleButton.textContent = showAreas ? "Areas: On" : "Areas: Off";
  });
}

const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".speed-button"));
if (speedButtons.length > 0) {
  const setActiveSpeed = (value: number) => {
    aircraftRenderer.setSpeedMultiplier(value);
    for (const button of speedButtons) {
      const buttonValue = Number(button.dataset.speed);
      button.classList.toggle("active", buttonValue === value);
    }
  };

  for (const button of speedButtons) {
    button.addEventListener("click", () => {
      const value = Number(button.dataset.speed);
      if (!Number.isFinite(value)) return;
      setActiveSpeed(value);
    });
  }

  const initialSpeedButton = speedButtons.find((button) => button.classList.contains("active"));
  const initialSpeed = initialSpeedButton ? Number(initialSpeedButton.dataset.speed) : 1;
  if (Number.isFinite(initialSpeed)) {
    setActiveSpeed(initialSpeed);
  }
}

const splitHorizontalButton = document.getElementById("split-horizontal") as HTMLButtonElement | null;
const splitVerticalButton = document.getElementById("split-vertical") as HTMLButtonElement | null;
const resetPanesButton = document.getElementById("reset-panes") as HTMLButtonElement | null;

const splitActivePane = (orientation: Orientation) => {
  if (countPanes(layout) >= MAX_PANES) {
    console.log("Maximum panes reached.");
    return;
  }
  updateLayoutCache();
  const targetId = layoutCache.rects.has(activePaneId) ? activePaneId : ROOT_PANE_ID;
  const newPaneId = `pane-${paneCounter++}`;
  const result = splitLayout(layout, targetId, orientation, newPaneId);
  if (!result.didSplit) return;
  layout = result.node;
  createPaneState(newPaneId, targetId);
  activePaneId = newPaneId;
  tessera.requestRender();
};

const resetPanes = () => {
  layout = createLayout(ROOT_PANE_ID);
  for (const id of Array.from(paneStates.keys())) {
    if (id !== ROOT_PANE_ID) {
      paneStates.delete(id);
    }
  }
  labelRenderers.clear();
  activePaneId = ROOT_PANE_ID;
  tessera.requestRender();
};

if (splitHorizontalButton) {
  splitHorizontalButton.addEventListener("click", () => splitActivePane("horizontal"));
}

if (splitVerticalButton) {
  splitVerticalButton.addEventListener("click", () => splitActivePane("vertical"));
}

if (resetPanesButton) {
  resetPanesButton.addEventListener("click", resetPanes);
}

const contextMenu = document.getElementById("context-menu") as HTMLDivElement | null;
const goHereButton = document.getElementById("context-go-here") as HTMLButtonElement | null;
let contextTargetWorld: { x: number; y: number } | null = null;

const hideContextMenu = () => {
  if (!contextMenu) return;
  contextMenu.style.display = "none";
  contextTargetWorld = null;
};

const showContextMenu = (clientX: number, clientY: number) => {
  if (!contextMenu) return;
  contextMenu.style.display = "block";
  contextMenu.style.left = `${clientX}px`;
  contextMenu.style.top = `${clientY}px`;
  if (goHereButton) {
    goHereButton.disabled = selectionState.selectedIds.size === 0;
  }
};

const getPointer = (event: MouseEvent | WheelEvent) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    screenX: (event.clientX - rect.left) * dpr,
    screenY: (event.clientY - rect.top) * dpr,
  };
};

const pointInRect = (x: number, y: number, rect: PaneRect) => {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
};

interface PaneSelectionState {
  isSelecting: boolean;
  isClicking: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  selectionRect: ScreenRect | null;
  selectedIds: Set<string>;
  paneId: string | null;
}

const selectionState: PaneSelectionState = {
  isSelecting: false,
  isClicking: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  selectionRect: null,
  selectedIds: new Set<string>(),
  paneId: null,
};

const panState = {
  active: false,
  paneId: null as string | null,
  lastX: 0,
  lastY: 0,
};

const clickState = {
  active: false,
  startX: 0,
  startY: 0,
};

const splitterState = {
  active: false,
  handle: null as SplitterHandle | null,
};

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const { screenX, screenY } = getPointer(event);
  const context = getPaneContext(screenX, screenY);
  if (!context) return;
  activePaneId = context.paneId;
  const world = screenToWorld(
    context.localX,
    context.localY,
    context.matrix,
    context.viewportWidth,
    context.viewportHeight
  );
  const wrappedX = ((world.worldX % 1) + 1) % 1;
  const clampedY = Math.min(1, Math.max(0, world.worldY));
  contextTargetWorld = { x: wrappedX, y: clampedY };
  showContextMenu(event.clientX, event.clientY);
});

document.addEventListener("click", (event) => {
  if (!contextMenu || contextMenu.style.display === "none") return;
  if (contextMenu.contains(event.target as Node)) return;
  hideContextMenu();
});

window.addEventListener("blur", hideContextMenu);

if (goHereButton) {
  goHereButton.addEventListener("click", () => {
    if (!contextTargetWorld || selectionState.selectedIds.size === 0) {
      hideContextMenu();
      return;
    }
    aircraftRenderer.setDestinationForAircraft(
      selectionState.selectedIds,
      contextTargetWorld.x,
      contextTargetWorld.y
    );
    hideContextMenu();
  });
}

// Load font atlas
const fontAtlas = createFontAtlas({
  fontFamily: "Arial, sans-serif",
  fontSize: 32,
  atlasSize: 512,
});

fontAtlas.ready.then(() => {
  sdfRenderer.loadFontAtlas(fontAtlas.metadata, fontAtlas.image);

  // Create TextLayout for accurate text measurement
  const textLayout = new TextLayout(fontAtlas.metadata);
  measureFn = (text, fontSize) => textLayout.measureLine(text, fontSize);
  for (const renderer of labelRenderers.values()) {
    renderer.setMeasureFunction(measureFn);
  }

  console.log("Font atlas loaded for aircraft labels");
});

let showDebugGrid = false;
window.addEventListener("keydown", (event) => {
  if (event.key === "g" || event.key === "G") {
    showDebugGrid = !showDebugGrid;
    console.log(`Debug grid: ${showDebugGrid ? "ON" : "OFF"}`);
    tessera.requestRender();
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (editableAreasState.dragState) return;
  if (event.button !== 0) return;
  hideContextMenu();

  const { screenX, screenY } = getPointer(event);
  updateLayoutCache();
  const splitter = layoutCache.splitters.find((item) => pointInRect(screenX, screenY, item.rect));
  if (splitter) {
    splitterState.active = true;
    splitterState.handle = splitter;
    canvas.style.cursor = splitter.node.orientation === "vertical" ? "col-resize" : "row-resize";
    return;
  }

  const context = getPaneContext(screenX, screenY);
  if (!context) return;
  activePaneId = context.paneId;

  if (event.shiftKey) {
    selectionState.isSelecting = true;
    selectionState.paneId = context.paneId;
    selectionState.startX = context.localX;
    selectionState.startY = context.localY;
    selectionState.currentX = context.localX;
    selectionState.currentY = context.localY;
    selectionState.selectionRect = normalizeRect(
      selectionState.startX,
      selectionState.startY,
      selectionState.currentX,
      selectionState.currentY
    );
    canvas.style.cursor = "crosshair";
    tessera.requestRender();
    return;
  }

  panState.active = true;
  panState.paneId = context.paneId;
  panState.lastX = screenX;
  panState.lastY = screenY;

  clickState.active = true;
  clickState.startX = screenX;
  clickState.startY = screenY;
  canvas.style.cursor = "grabbing";
});

window.addEventListener("mousemove", (event) => {
  const { screenX, screenY } = getPointer(event);

  if (splitterState.active && splitterState.handle) {
    const { node, container } = splitterState.handle;
    const ratio =
      node.orientation === "vertical"
        ? (screenX - container.x) / Math.max(1, container.width)
        : (screenY - container.y) / Math.max(1, container.height);
    node.ratio = clampRatio(ratio);
    tessera.requestRender();
    return;
  }

  if (editableAreasState.dragState) {
    clickState.active = false;
    panState.active = false;
    return;
  }

  if (selectionState.isSelecting && selectionState.paneId) {
    const context = getPaneContext(screenX, screenY, selectionState.paneId);
    if (context) {
      selectionState.currentX = context.localX;
      selectionState.currentY = context.localY;
      selectionState.selectionRect = normalizeRect(
        selectionState.startX,
        selectionState.startY,
        selectionState.currentX,
        selectionState.currentY
      );
      tessera.requestRender();
    }
    return;
  }

  if (panState.active && panState.paneId) {
    const context = getPaneContext(screenX, screenY, panState.paneId);
    const pane = context ? paneStates.get(panState.paneId) : null;
    if (context && pane) {
      const dx = screenX - panState.lastX;
      const dy = screenY - panState.lastY;
      panState.lastX = screenX;
      panState.lastY = screenY;
      pane.camera.pan(dx, dy, context.viewportWidth, context.viewportHeight);
      tessera.requestRender();
    }
  }

  if (clickState.active) {
    const dx = screenX - clickState.startX;
    const dy = screenY - clickState.startY;
    if (dx * dx + dy * dy > 16) {
      clickState.active = false;
    }
  }

  if (!panState.active && !selectionState.isSelecting && !splitterState.active) {
    updateLayoutCache();
    const splitter = layoutCache.splitters.find((item) => pointInRect(screenX, screenY, item.rect));
    if (splitter) {
      canvas.style.cursor = splitter.node.orientation === "vertical" ? "col-resize" : "row-resize";
    } else {
      canvas.style.cursor = "grab";
    }
    const context = getPaneContext(screenX, screenY);
    if (context) {
      activePaneId = context.paneId;
    }
  }
});

window.addEventListener("mouseup", (event) => {
  if (splitterState.active) {
    splitterState.active = false;
    splitterState.handle = null;
    canvas.style.cursor = "grab";
    return;
  }

  if (editableAreasState.dragState) {
    clickState.active = false;
    panState.active = false;
    return;
  }

  if (selectionState.isSelecting && selectionState.paneId) {
    const rect = selectionState.selectionRect;
    const { screenX, screenY } = getPointer(event);
    const context = getPaneContext(screenX, screenY, selectionState.paneId);
    selectionState.isSelecting = false;
    selectionState.selectionRect = null;
    canvas.style.cursor = "grab";

    if (!rect || !context) {
      selectionState.selectedIds.clear();
      tessera.requestRender();
    } else {
      const items = aircraftRenderer.aircraft.map((ac) => ({
        id: ac.icao24,
        x: ac.x,
        y: ac.y,
      }));
      const projected = projectSelectionItems(
        items,
        context.matrix,
        context.viewportWidth,
        context.viewportHeight,
        context.bounds,
        0
      );
      const selected = selectIdsInRect(projected, rect);
      selectionState.selectedIds.clear();
      for (const id of selected) {
        selectionState.selectedIds.add(id);
      }
      tessera.requestRender();
    }
  }

  if (panState.active) {
    panState.active = false;
    panState.paneId = null;
    canvas.style.cursor = "grab";
  }

  if (clickState.active) {
    clickState.active = false;
    selectionState.selectedIds.clear();
    tessera.requestRender();
  }
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    hideContextMenu();
    const { screenX, screenY } = getPointer(event);
    const context = getPaneContext(screenX, screenY);
    if (!context) return;
    activePaneId = context.paneId;
    const pane = paneStates.get(context.paneId);
    if (!pane) return;
    const delta = -event.deltaY * 0.002;
    pane.camera.addZoomVelocity(
      delta,
      context.localX,
      context.localY,
      context.viewportWidth,
      context.viewportHeight
    );
    tessera.requestRender();
  },
  { passive: false }
);

canvas.style.cursor = "grab";

console.log("Controls: drag to pan, shift+drag to select, scroll to zoom, G to toggle debug grid");

// ============================================
// MAIN RENDER LOOP
// ============================================

let lastTime = performance.now();

const renderPaneBorder = (
  matrix: Float32Array,
  w: number,
  h: number,
  bounds: { left: number; right: number; top: number; bottom: number },
  isActive: boolean
) => {
  const worldPerPixel = (bounds.right - bounds.left) / Math.max(1, w);
  const lineWidth = worldPerPixel * (isActive ? 2 : 1);
  const topLeft = screenToWorld(0, 0, matrix, w, h);
  const bottomRight = screenToWorld(w, h, matrix, w, h);
  draw.begin(matrix, w, h);
  draw.strokeStyle = isActive ? [1, 1, 1, 0.8] : [0, 0, 0, 0.35];
  draw.lineWidth = lineWidth;
  draw.strokeRect(
    topLeft.worldX,
    topLeft.worldY,
    bottomRight.worldX - topLeft.worldX,
    bottomRight.worldY - topLeft.worldY
  );
  draw.end();
};

tessera.render = function () {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  borderRenderer.update(dt);
  aircraftRenderer.update();

  updateLayoutCache();

  const gl = this.gl;
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!layoutCache.rects.has(activePaneId)) {
    const firstPane = layoutCache.rects.keys().next().value as string | undefined;
    if (firstPane) {
      activePaneId = firstPane;
    }
  }

  const referencePaneId = layoutCache.rects.has(activePaneId)
    ? activePaneId
    : layoutCache.rects.keys().next().value;
  const referencePane = referencePaneId ? paneStates.get(referencePaneId) : null;
  const referenceRect = referencePaneId ? layoutCache.rects.get(referencePaneId) : null;
  if (referencePane && referenceRect) {
    const refBounds = referencePane.camera.getVisibleBounds(referenceRect.width, referenceRect.height);
    const viewWidth = refBounds.right - refBounds.left;
    const aircraftSize = aircraftRenderer.getAircraftSize(
      referencePane.camera.zoom,
      viewWidth,
      referenceRect.width
    );
    aircraftRenderer.updateTrails(now / 1000, aircraftRenderer.getTrailSampleDistance(aircraftSize));
  }

  for (const [paneId, rect] of layoutCache.rects) {
    if (!paneStates.has(paneId)) {
      createPaneState(paneId, activePaneId);
    }
    const pane = paneStates.get(paneId);
    if (!pane) continue;

    const viewportX = rect.x;
    const viewportY = this.canvas.height - rect.y - rect.height;
    gl.viewport(viewportX, viewportY, rect.width, rect.height);
    gl.scissor(viewportX, viewportY, rect.width, rect.height);

    const zoomAnimating = pane.camera.updateZoom(dt);
    pane.isZooming = zoomAnimating;
    if (zoomAnimating) {
      this.requestRender();
    }

    this.renderTiles(pane.camera, rect.width, rect.height);

    const matrix = pane.camera.getMatrix(rect.width, rect.height);
    const bounds = pane.camera.getVisibleBounds(rect.width, rect.height);
    const viewWidth = bounds.right - bounds.left;
    const aircraftSize = aircraftRenderer.getAircraftSize(pane.camera.zoom, viewWidth, rect.width);

    draw.begin(matrix, rect.width, rect.height);
    borderRenderer.render(draw, bounds);
    draw.end();

    if (showTrails) {
      aircraftRenderer.renderTrails(
        trailRenderer,
        matrix,
        now / 1000,
        bounds,
        aircraftRenderer.getTrailStampSize(aircraftSize)
      );
    }

    if (showSensors) {
      aircraftRenderer.renderSensors(
        sensorConeRenderer,
        matrix,
        now / 1000,
        aircraftRenderer.getSpeedMultiplier(),
        bounds,
        aircraftSize
      );
    }

    if (showAreas) {
      circleRenderer.begin(matrix, rect.width, rect.height);
    }

    draw.begin(matrix, rect.width, rect.height);
    if (showAreas) {
      renderEditableAreas(draw, matrix, rect.width, rect.height, bounds, now / 1000, editableAreasState, circleRenderer);
    }
    draw.end();

    if (showAreas) {
      circleRenderer.render();
    }

    draw.begin(matrix, rect.width, rect.height);
    aircraftRenderer.render(draw, bounds, aircraftSize);
    draw.end();

    const commandLabels = showGroups
      ? renderCommandHulls(
          draw,
          matrix,
          rect.width,
          rect.height,
          bounds,
          aircraftRenderer,
          aircraftRenderer.getCommandGroups(),
          commandLineRenderer,
          now / 1000
        )
      : [];

    renderSelectionHighlights(
      draw,
      matrix,
      rect.width,
      rect.height,
      bounds,
      aircraftRenderer,
      aircraftSize,
      selectionState.selectedIds,
      now / 1000,
      dashedLineRenderer,
      dashedRingRenderer
    );

    sdfRenderer.clearText();
    if (showLabels) {
      const labelRenderer = getLabelRenderer(paneId);
      labelRenderer.render(
        draw,
        sdfRenderer,
        aircraftRenderer,
        matrix,
        rect.width,
        rect.height,
        bounds,
        aircraftSize,
        pane.camera.zoom,
        pane.isZooming
      );
    }

    if (showGroups && commandLabels.length > 0) {
      const commandLabelStyle = getCommandLabelStyle();
      for (const label of commandLabels) {
        sdfRenderer.addText(label.text, label.x, label.y, commandLabelStyle);
      }
    }

    if (showDebugGrid) {
      const labelRenderer = getLabelRenderer(paneId);
      renderDebugGrid(draw, matrix, rect.width, rect.height, labelRenderer.getClusterCellSize());
    }

    if (paneId === activePaneId) {
      renderStatsOverlay(draw, sdfRenderer, matrix, rect.width, rect.height, pane.camera.zoom);
    }

    if (selectionState.isSelecting && selectionState.paneId === paneId) {
      renderSelectionBox(draw, matrix, rect.width, rect.height, selectionState);
    }

    if (showAreas && paneId === activePaneId) {
      renderEditableAreaHandles(draw, matrix, rect.width, rect.height, bounds, editableAreasState);
    }

    renderPaneBorder(matrix, rect.width, rect.height, bounds, paneId === activePaneId);

    sdfRenderer.render(matrix, rect.width, rect.height);
  }

  gl.disable(gl.SCISSOR_TEST);

  this.requestRender();
};

// Start render loop
tessera.start();

console.log("Shapes loaded along US state borders (count will appear when loaded)");
