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
import { UIContext, virtualList, type ViewBounds } from "../src/ui";
import type { Aircraft } from "./adsb";
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
  collectPaneIds,
  computePaneRects,
  countPanes,
  createLayout,
  findPaneAt,
  removePane,
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
import {
  normalizeRect,
  projectSelectionItems,
  selectIdsInRect,
  wrapWorldXNear,
  type ScreenRect,
} from "./SelectionUtils";
import { TrailRenderer } from "./TrailRenderer";
import { screenToWorld, worldToScreen } from "./CoordinateUtils";
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

// Create UI context for immediate mode UI
const uiDpr = window.devicePixelRatio || 1;
const uiScale = uiDpr; // Scale with DPR for crisp rendering
const uiContext = new UIContext({
  canvas,
  gl: tessera.gl,
  drawContext: draw,
  sdfRenderer,
  theme: {
    scrollbar: {
      trackColor: [0.15, 0.15, 0.15, 0.8],
      thumbColor: [0.4, 0.4, 0.4, 0.8],
      thumbHoverColor: [0.5, 0.5, 0.5, 0.9],
      thumbActiveColor: [0.6, 0.6, 0.6, 1.0],
      width: 12 * uiScale,
      minThumbSize: 24 * uiScale,
      borderRadius: 6 * uiScale,
    },
    list: {
      itemHeight: 28 * uiScale,
      itemPadding: 8 * uiScale,
      itemBackground: [0.1, 0.1, 0.1, 0.8],
      itemAltBackground: [0.12, 0.12, 0.12, 0.8],
      itemHoverBackground: [0.25, 0.25, 0.25, 0.8],
      itemSelectedBackground: [0.2, 0.4, 0.6, 0.8],
      itemTextColor: [0.9, 0.9, 0.9, 1.0],
      itemSelectedTextColor: [1, 1, 1, 1.0],
      fontSize: 13 * uiScale,
      dividerColor: [1, 1, 1, 0.08],
      dividerWidth: 1 * uiScale,
    },
  },
});

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
  showLabels: boolean;
  showGroups: boolean;
  showSensors: boolean;
  showTrails: boolean;
  showAreas: boolean;
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
  const defaults = {
    showLabels: true,
    showGroups: true,
    showSensors: true,
    showTrails: true,
    showAreas: true,
  };
  if (sourceId) {
    const source = paneStates.get(sourceId);
    if (source) {
      camera.centerX = source.camera.centerX;
      camera.centerY = source.camera.centerY;
      camera.zoom = source.camera.zoom;
      defaults.showLabels = source.showLabels;
      defaults.showGroups = source.showGroups;
      defaults.showSensors = source.showSensors;
      defaults.showTrails = source.showTrails;
      defaults.showAreas = source.showAreas;
    }
  }
  paneStates.set(id, { id, camera, isZooming: false, ...defaults });
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
const SPLITTER_DRAW_THICKNESS = 6;
const SPLITTER_COLOR: [number, number, number, number] = [0.0, 0.95, 0.85, 0.9];

const getScreenMatrix = (width: number, height: number) =>
  new Float32Array([2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1]);

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
    setActivePane(targetId);
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

const paneUiLayer = document.getElementById("pane-ui-layer") as HTMLDivElement | null;

type PaneToggleUI = {
  root: HTMLDivElement;
  labels: HTMLButtonElement;
  groups: HTMLButtonElement;
  sensors: HTMLButtonElement;
  trails: HTMLButtonElement;
  areas: HTMLButtonElement;
};

const paneToggleUIs = new Map<string, PaneToggleUI>();
const PANE_UI_PADDING = 10;

const updatePaneToggleLabels = (paneId: string) => {
  const pane = paneStates.get(paneId);
  const ui = paneToggleUIs.get(paneId);
  if (!pane || !ui) return;
  ui.labels.textContent = `Labels: ${pane.showLabels ? "On" : "Off"}`;
  ui.groups.textContent = `Groups: ${pane.showGroups ? "On" : "Off"}`;
  ui.sensors.textContent = `Sensors: ${pane.showSensors ? "On" : "Off"}`;
  ui.trails.textContent = `Trails: ${pane.showTrails ? "On" : "Off"}`;
  ui.areas.textContent = `Areas: ${pane.showAreas ? "On" : "Off"}`;
};

const setActivePane = (paneId: string) => {
  if (!paneStates.has(paneId)) return;
  if (activePaneId === paneId) return;
  activePaneId = paneId;
  const pane = paneStates.get(paneId);
  if (pane) {
    editableAreasState.enabled = pane.showAreas;
    if (!pane.showAreas) {
      editableAreasState.activeHandle = null;
      editableAreasState.dragState = null;
    }
  }
};

const setPaneAreasVisible = (paneId: string, visible: boolean) => {
  const pane = paneStates.get(paneId);
  if (!pane) return;
  pane.showAreas = visible;
  if (paneId === activePaneId) {
    editableAreasState.enabled = visible;
    if (!visible) {
      editableAreasState.selectedId = null;
      editableAreasState.activeHandle = null;
      editableAreasState.dragState = null;
    }
  }
  updatePaneToggleLabels(paneId);
  tessera.requestRender();
};

const createPaneToggleUI = (paneId: string) => {
  if (!paneUiLayer) return;
  const root = document.createElement("div");
  root.className = "pane-toggle-group";

  const createButton = (label: string, className: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pane-toggle ${className}`;
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return button;
  };

  const labelsButton = createButton("Labels: On", "toggle-labels");
  const groupsButton = createButton("Groups: On", "toggle-groups");
  const sensorsButton = createButton("Sensors: On", "toggle-sensors");
  const trailsButton = createButton("Trails: On", "toggle-trails");
  const areasButton = createButton("Areas: On", "toggle-areas");

  labelsButton.addEventListener("click", () => {
    const pane = paneStates.get(paneId);
    if (!pane) return;
    pane.showLabels = !pane.showLabels;
    updatePaneToggleLabels(paneId);
    tessera.requestRender();
  });

  groupsButton.addEventListener("click", () => {
    const pane = paneStates.get(paneId);
    if (!pane) return;
    pane.showGroups = !pane.showGroups;
    updatePaneToggleLabels(paneId);
    tessera.requestRender();
  });

  sensorsButton.addEventListener("click", () => {
    const pane = paneStates.get(paneId);
    if (!pane) return;
    pane.showSensors = !pane.showSensors;
    updatePaneToggleLabels(paneId);
    tessera.requestRender();
  });

  trailsButton.addEventListener("click", () => {
    const pane = paneStates.get(paneId);
    if (!pane) return;
    pane.showTrails = !pane.showTrails;
    updatePaneToggleLabels(paneId);
    tessera.requestRender();
  });

  areasButton.addEventListener("click", () => {
    const pane = paneStates.get(paneId);
    if (!pane) return;
    setPaneAreasVisible(paneId, !pane.showAreas);
  });

  root.append(labelsButton, groupsButton, sensorsButton, trailsButton, areasButton);
  paneUiLayer.appendChild(root);

  const ui = {
    root,
    labels: labelsButton,
    groups: groupsButton,
    sensors: sensorsButton,
    trails: trailsButton,
    areas: areasButton,
  };
  paneToggleUIs.set(paneId, ui);
  updatePaneToggleLabels(paneId);
};

const syncPaneToggleUI = () => {
  if (!paneUiLayer) return;
  const dpr = window.devicePixelRatio || 1;
  const paneIds = new Set(layoutCache.rects.keys());
  for (const [id, ui] of paneToggleUIs) {
    if (!paneIds.has(id)) {
      ui.root.remove();
      paneToggleUIs.delete(id);
    }
  }
  for (const id of paneIds) {
    if (!paneToggleUIs.has(id)) {
      createPaneToggleUI(id);
    }
  }
  for (const [id, rect] of layoutCache.rects) {
    const ui = paneToggleUIs.get(id);
    if (!ui) continue;
    ui.root.style.left = `${rect.x / dpr + PANE_UI_PADDING}px`;
    ui.root.style.top = `${rect.y / dpr + PANE_UI_PADDING}px`;
    ui.root.style.transform = "";
  }
};

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

const splitPane = (targetId: string, orientation: Orientation) => {
  if (countPanes(layout) >= MAX_PANES) {
    console.log("Maximum panes reached.");
    return;
  }
  updateLayoutCache();
  const fallbackId = layoutCache.rects.keys().next().value ?? ROOT_PANE_ID;
  const resolvedTarget = layoutCache.rects.has(targetId) ? targetId : fallbackId;
  const newPaneId = `pane-${paneCounter++}`;
  const result = splitLayout(layout, resolvedTarget, orientation, newPaneId);
  if (!result.didSplit) return;
  layout = result.node;
  createPaneState(newPaneId, resolvedTarget);
  const targetPane = paneStates.get(resolvedTarget);
  const targetRect = layoutCache.rects.get(resolvedTarget);
  const newPane = paneStates.get(newPaneId);
  if (targetPane && targetRect && newPane) {
    const bounds = targetPane.camera.getVisibleBounds(targetRect.width, targetRect.height);
    const viewWidth = bounds.right - bounds.left;
    const viewHeight = bounds.bottom - bounds.top;
    newPane.camera.centerX = targetPane.camera.centerX + viewWidth * 0.15;
    newPane.camera.centerY = targetPane.camera.centerY + viewHeight * 0.1;
    newPane.camera.zoom = Math.min(Camera.MAX_ZOOM, targetPane.camera.zoom + 0.75);
  }
  setActivePane(newPaneId);
  syncPaneState();
  tessera.requestRender();
};

const removePaneById = (targetId: string) => {
  if (countPanes(layout) <= 1) return;
  const result = removePane(layout, targetId);
  if (!result.removed || !result.node) return;
  layout = result.node;
  syncPaneState();
  tessera.requestRender();
};

const keepOnlyPane = (targetId: string) => {
  updateLayoutCache();
  if (!layoutCache.rects.has(targetId)) return;
  layout = createLayout(targetId);
  syncPaneState();
  tessera.requestRender();
};

const syncPaneState = () => {
  const paneIds = new Set<string>();
  collectPaneIds(layout, paneIds);
  for (const id of Array.from(paneStates.keys())) {
    if (!paneIds.has(id)) {
      paneStates.delete(id);
      labelRenderers.delete(id);
    }
  }
  for (const id of paneIds) {
    if (!paneStates.has(id)) {
      createPaneState(id, activePaneId);
    }
  }
  if (!paneIds.has(activePaneId)) {
    const nextId = paneIds.values().next().value ?? ROOT_PANE_ID;
    setActivePane(nextId);
  }
  syncPaneToggleUI();
};

const contextMenu = document.getElementById("context-menu") as HTMLDivElement | null;
const goHereButton = document.getElementById("context-go-here") as HTMLButtonElement | null;
const splitHorizontalMenu = document.getElementById("context-split-horizontal") as HTMLButtonElement | null;
const splitVerticalMenu = document.getElementById("context-split-vertical") as HTMLButtonElement | null;
const removePaneMenu = document.getElementById("context-remove-pane") as HTMLButtonElement | null;
const isolatePaneMenu = document.getElementById("context-isolate-pane") as HTMLButtonElement | null;
let contextTargetWorld: { x: number; y: number } | null = null;
let contextPaneId: string | null = null;

const hideContextMenu = () => {
  if (!contextMenu) return;
  contextMenu.style.display = "none";
  contextTargetWorld = null;
  contextPaneId = null;
};

const showContextMenu = (clientX: number, clientY: number) => {
  if (!contextMenu) return;
  contextMenu.style.display = "block";
  contextMenu.style.left = `${clientX}px`;
  contextMenu.style.top = `${clientY}px`;
  if (goHereButton) {
    goHereButton.disabled = selectionState.selectedIds.size === 0;
  }
  const paneCount = countPanes(layout);
  const canSplit = paneCount < MAX_PANES;
  if (splitHorizontalMenu) splitHorizontalMenu.disabled = !contextPaneId || !canSplit;
  if (splitVerticalMenu) splitVerticalMenu.disabled = !contextPaneId || !canSplit;
  if (removePaneMenu) removePaneMenu.disabled = !contextPaneId || paneCount <= 1;
  if (isolatePaneMenu) isolatePaneMenu.disabled = !contextPaneId || paneCount <= 1;
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

const viewportDragState = {
  active: false,
  targetPaneId: null as string | null,
  sourcePaneId: null as string | null,
  lastWorld: { x: 0, y: 0 },
};

const VIEWPORT_HANDLE_SIZE_PX = 36;
const VIEWPORT_HANDLE_INSET_PX = 4;

const PANE_VIEW_COLORS: Array<[number, number, number, number]> = [
  [0.0, 0.95, 0.85, 0.9],
  [1.0, 0.6, 0.1, 0.9],
  [0.5, 1.0, 0.2, 0.9],
  [0.4, 0.6, 1.0, 0.9],
  [1.0, 0.3, 0.7, 0.9],
  [0.8, 0.9, 0.2, 0.9],
  [0.9, 0.5, 0.2, 0.9],
  [0.4, 1.0, 0.7, 0.9],
];

const getPaneColor = (paneId: string): [number, number, number, number] => {
  const numeric = Number(paneId.replace("pane-", ""));
  if (Number.isFinite(numeric)) {
    return PANE_VIEW_COLORS[Math.abs(numeric) % PANE_VIEW_COLORS.length]!;
  }
  let hash = 0;
  for (let i = 0; i < paneId.length; i++) {
    hash = (hash * 31 + paneId.charCodeAt(i)) >>> 0;
  }
  return PANE_VIEW_COLORS[hash % PANE_VIEW_COLORS.length]!;
};

const getViewportBounds = (paneId: string) => {
  const rect = layoutCache.rects.get(paneId);
  const pane = paneStates.get(paneId);
  if (!rect || !pane) return null;
  return pane.camera.getVisibleBounds(rect.width, rect.height);
};

const computeViewportRects = () => {
  return Array.from(layoutCache.rects.entries())
    .map(([paneId, rect]) => {
      const pane = paneStates.get(paneId);
      if (!pane) return null;
      return {
        paneId,
        bounds: pane.camera.getVisibleBounds(rect.width, rect.height),
        color: getPaneColor(paneId),
      };
    })
    .filter(
      (
        item
      ): item is {
        paneId: string;
        bounds: { left: number; right: number; top: number; bottom: number };
        color: [number, number, number, number];
      } => !!item
    );
};

const wrapViewportBounds = (
  bounds: { left: number; right: number; top: number; bottom: number },
  referenceX: number
) => {
  const center = (bounds.left + bounds.right) / 2;
  const wrappedCenter = wrapWorldXNear(center, referenceX);
  const dx = wrappedCenter - center;
  return {
    left: bounds.left + dx,
    right: bounds.right + dx,
    top: bounds.top,
    bottom: bounds.bottom,
  };
};

const getViewportHandle = (
  bounds: { left: number; right: number; top: number; bottom: number },
  worldPerPixel: number
) => {
  const size = VIEWPORT_HANDLE_SIZE_PX * worldPerPixel;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    size,
  };
};

const findViewportHit = (
  worldX: number,
  worldY: number,
  currentPaneId: string,
  worldPerPixel: number,
  viewportRects: Array<{
    paneId: string;
    bounds: { left: number; right: number; top: number; bottom: number };
    color: [number, number, number, number];
  }>,
  referenceX: number
) => {
  let bestId: string | null = null;
  let bestArea = Infinity;
  for (const rect of viewportRects) {
    if (rect.paneId === currentPaneId) continue;
    const wrappedBounds = wrapViewportBounds(rect.bounds, referenceX);
    const handle = getViewportHandle(wrappedBounds, worldPerPixel);
    if (
      worldX < handle.x ||
      worldX > handle.x + handle.size ||
      worldY < handle.y ||
      worldY > handle.y + handle.size
    ) {
      continue;
    }
    const area = (wrappedBounds.right - wrappedBounds.left) * (wrappedBounds.bottom - wrappedBounds.top);
    if (area < bestArea) {
      bestArea = area;
      bestId = rect.paneId;
    }
  }
  return bestId;
};

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const { screenX, screenY } = getPointer(event);
  const context = getPaneContext(screenX, screenY);
  if (!context) return;
  setActivePane(context.paneId);
  contextPaneId = context.paneId;
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

if (splitHorizontalMenu) {
  splitHorizontalMenu.addEventListener("click", () => {
    if (!contextPaneId) return;
    splitPane(contextPaneId, "horizontal");
    hideContextMenu();
  });
}

if (splitVerticalMenu) {
  splitVerticalMenu.addEventListener("click", () => {
    if (!contextPaneId) return;
    splitPane(contextPaneId, "vertical");
    hideContextMenu();
  });
}

if (removePaneMenu) {
  removePaneMenu.addEventListener("click", () => {
    if (!contextPaneId) return;
    removePaneById(contextPaneId);
    hideContextMenu();
  });
}

if (isolatePaneMenu) {
  isolatePaneMenu.addEventListener("click", () => {
    if (!contextPaneId) return;
    keepOnlyPane(contextPaneId);
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

// Check if point is within the vehicle list UI bounds
const isPointInVehicleListUI = (screenX: number, screenY: number): boolean => {
  const listX = 20 * uiScale;
  const listY = 60 * uiScale - 24 * uiScale; // Include header
  const listWidth = 260 * uiScale;
  const listHeight = Math.min(400 * uiScale, canvas.height - 80 * uiScale) + 24 * uiScale;
  return screenX >= listX && screenX <= listX + listWidth && screenY >= listY && screenY <= listY + listHeight;
};

canvas.addEventListener("mousedown", (event) => {
  if (editableAreasState.dragState) return;
  if (event.button !== 0) return;
  hideContextMenu();

  const { screenX, screenY } = getPointer(event);

  // Skip map interaction if clicking on UI
  if (isPointInVehicleListUI(screenX, screenY)) {
    return;
  }
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
  setActivePane(context.paneId);
  const worldPoint = screenToWorld(
    context.localX,
    context.localY,
    context.matrix,
    context.viewportWidth,
    context.viewportHeight
  );
  const worldPerPixel = (context.bounds.right - context.bounds.left) / Math.max(1, context.viewportWidth);
  const viewportRects = computeViewportRects();
  const referenceX = (context.bounds.left + context.bounds.right) / 2;
  const viewportHit = findViewportHit(
    worldPoint.worldX,
    worldPoint.worldY,
    context.paneId,
    worldPerPixel,
    viewportRects,
    referenceX
  );
  if (viewportHit) {
    viewportDragState.active = true;
    viewportDragState.targetPaneId = viewportHit;
    viewportDragState.sourcePaneId = context.paneId;
    viewportDragState.lastWorld = { x: worldPoint.worldX, y: worldPoint.worldY };
    canvas.style.cursor = "move";
    return;
  }

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

  if (viewportDragState.active && viewportDragState.targetPaneId && viewportDragState.sourcePaneId) {
    const context = getPaneContext(screenX, screenY, viewportDragState.sourcePaneId);
    if (context) {
      const world = screenToWorld(
        context.localX,
        context.localY,
        context.matrix,
        context.viewportWidth,
        context.viewportHeight
      );
      const targetPane = paneStates.get(viewportDragState.targetPaneId);
      if (targetPane) {
        const dx = world.worldX - viewportDragState.lastWorld.x;
        const dy = world.worldY - viewportDragState.lastWorld.y;
        targetPane.camera.centerX += dx;
        targetPane.camera.centerY += dy;
        viewportDragState.lastWorld = { x: world.worldX, y: world.worldY };
        setActivePane(targetPane.id);
        tessera.requestRender();
      }
    }
    return;
  }

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
      setActivePane(context.paneId);
      const worldPoint = screenToWorld(
        context.localX,
        context.localY,
        context.matrix,
        context.viewportWidth,
        context.viewportHeight
      );
      const worldPerPixel = (context.bounds.right - context.bounds.left) / Math.max(1, context.viewportWidth);
      const viewportRects = computeViewportRects();
      const referenceX = (context.bounds.left + context.bounds.right) / 2;
      const hit = findViewportHit(
        worldPoint.worldX,
        worldPoint.worldY,
        context.paneId,
        worldPerPixel,
        viewportRects,
        referenceX
      );
      if (hit && !splitter) {
        canvas.style.cursor = "move";
      }
    }
  }
});

window.addEventListener("mouseup", (event) => {
  if (viewportDragState.active) {
    viewportDragState.active = false;
    viewportDragState.targetPaneId = null;
    viewportDragState.sourcePaneId = null;
    canvas.style.cursor = "grab";
    return;
  }
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

    // Skip map zoom if scrolling over UI
    if (isPointInVehicleListUI(screenX, screenY)) {
      tessera.requestRender(); // Still render to update list scroll
      return;
    }

    const context = getPaneContext(screenX, screenY);
    if (!context) return;
    setActivePane(context.paneId);
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
// VEHICLE LIST HELPERS
// ============================================

interface VehicleListItem {
  id: string;
  callsign: string;
  altitude: string;
  velocity: string;
  aircraft: Aircraft;
}

function formatAltitude(meters: number, onGround: boolean): string {
  if (onGround) return "GND";
  const feet = meters * 3.28084;
  if (feet >= 18000) {
    return `FL${Math.round(feet / 100)}`;
  }
  return `${Math.round(feet).toLocaleString()}ft`;
}

function formatVelocity(mps: number): string {
  const knots = mps * 1.94384;
  return `${Math.round(knots)}kt`;
}

function getVehiclesInViewport(
  aircraft: Aircraft[],
  bounds: ViewBounds
): VehicleListItem[] {
  const result: VehicleListItem[] = [];

  for (const ac of aircraft) {
    // Check Y bounds
    if (ac.y < bounds.top || ac.y > bounds.bottom) continue;

    // Check X bounds with wrapping
    let inBounds = false;
    if (ac.x >= bounds.left && ac.x <= bounds.right) {
      inBounds = true;
    } else if (ac.x + 1 >= bounds.left && ac.x + 1 <= bounds.right) {
      inBounds = true;
    } else if (ac.x - 1 >= bounds.left && ac.x - 1 <= bounds.right) {
      inBounds = true;
    }

    if (inBounds) {
      result.push({
        id: ac.icao24,
        callsign: ac.callsign || "------",
        altitude: formatAltitude(ac.altitude, ac.onGround),
        velocity: formatVelocity(ac.velocity),
        aircraft: ac,
      });
    }
  }

  // Sort by callsign for stable ordering
  result.sort((a, b) => a.callsign.localeCompare(b.callsign));

  return result;
}

let selectedVehicleId: string | null = null;

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
  syncPaneToggleUI();

  const viewportRects = computeViewportRects();

  const gl = this.gl;
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (!layoutCache.rects.has(activePaneId)) {
    const firstPane = layoutCache.rects.keys().next().value as string | undefined;
    if (firstPane) {
      setActivePane(firstPane);
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

    if (pane.showTrails) {
      aircraftRenderer.renderTrails(
        trailRenderer,
        matrix,
        now / 1000,
        bounds,
        aircraftRenderer.getTrailStampSize(aircraftSize)
      );
    }

    if (pane.showSensors) {
      aircraftRenderer.renderSensors(
        sensorConeRenderer,
        matrix,
        now / 1000,
        aircraftRenderer.getSpeedMultiplier(),
        bounds,
        aircraftSize
      );
    }

    if (pane.showAreas) {
      circleRenderer.begin(matrix, rect.width, rect.height);
    }

    draw.begin(matrix, rect.width, rect.height);
    if (pane.showAreas) {
      renderEditableAreas(draw, matrix, rect.width, rect.height, bounds, now / 1000, editableAreasState, circleRenderer);
    }
    draw.end();

    if (pane.showAreas) {
      circleRenderer.render();
    }

    draw.begin(matrix, rect.width, rect.height);
    aircraftRenderer.render(draw, bounds, aircraftSize);
    draw.end();

    const commandLabels = pane.showGroups
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

    if (viewportRects.length > 1) {
      const referenceX = (bounds.left + bounds.right) / 2;
      const screenMatrix = getScreenMatrix(rect.width, rect.height);
      const strokeWidth = 6;
      draw.begin(screenMatrix, rect.width, rect.height);
      draw.lineWidth = strokeWidth;
      for (const viewRect of viewportRects) {
        const isSelf = viewRect.paneId === paneId;
        if (isSelf) continue;
        const isActiveView = viewRect.paneId === activePaneId;
        const color = viewRect.color;
        const wrappedBounds = wrapViewportBounds(viewRect.bounds, referenceX);
        const topLeft = worldToScreen(
          wrappedBounds.left,
          wrappedBounds.top,
          matrix,
          rect.width,
          rect.height
        );
        const bottomRight = worldToScreen(
          wrappedBounds.right,
          wrappedBounds.bottom,
          matrix,
          rect.width,
          rect.height
        );
        const rectX = topLeft.screenX;
        const rectY = topLeft.screenY;
        const rectW = bottomRight.screenX - topLeft.screenX;
        const rectH = bottomRight.screenY - topLeft.screenY;
        draw.strokeStyle = [
          color[0],
          color[1],
          color[2],
          isActiveView ? Math.min(1, color[3] + 0.2) : 1,
        ];
        draw.strokeRect(rectX, rectY, rectW, rectH);

        const centerX = (wrappedBounds.left + wrappedBounds.right) / 2;
        const centerY = (wrappedBounds.top + wrappedBounds.bottom) / 2;
        const centerScreen = worldToScreen(centerX, centerY, matrix, rect.width, rect.height);
        const handleSize = VIEWPORT_HANDLE_SIZE_PX;
        draw.fillStyle = [color[0], color[1], color[2], 1];
        draw.fillRect(
          centerScreen.screenX - handleSize / 2,
          centerScreen.screenY - handleSize / 2,
          handleSize,
          handleSize
        );
        draw.strokeStyle = [0, 0, 0, 0.8];
        draw.strokeRect(
          centerScreen.screenX - handleSize / 2,
          centerScreen.screenY - handleSize / 2,
          handleSize,
          handleSize
        );
      }
      draw.end();
    }

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
    if (pane.showLabels) {
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

    if (pane.showGroups && commandLabels.length > 0) {
      const commandLabelStyle = getCommandLabelStyle();
      for (const label of commandLabels) {
        sdfRenderer.addText(label.text, label.x, label.y, commandLabelStyle);
      }
    }

    if (showDebugGrid) {
      const labelRenderer = getLabelRenderer(paneId);
      renderDebugGrid(draw, matrix, rect.width, rect.height, labelRenderer.getClusterCellSize());
    }

    if (selectionState.isSelecting && selectionState.paneId === paneId) {
      renderSelectionBox(draw, matrix, rect.width, rect.height, selectionState);
    }

    if (pane.showAreas && paneId === activePaneId) {
      renderEditableAreaHandles(draw, matrix, rect.width, rect.height, bounds, editableAreasState);
    }

    renderPaneBorder(matrix, rect.width, rect.height, bounds, paneId === activePaneId);

    sdfRenderer.render(matrix, rect.width, rect.height);
  }

  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);

  if (layoutCache.splitters.length > 0) {
    const screenMatrix = getScreenMatrix(this.canvas.width, this.canvas.height);
    draw.begin(screenMatrix, this.canvas.width, this.canvas.height);
    draw.fillStyle = SPLITTER_COLOR;
    for (const splitter of layoutCache.splitters) {
      const { rect, node } = splitter;
      if (node.orientation === "vertical") {
        const x = rect.x + rect.width / 2 - SPLITTER_DRAW_THICKNESS / 2;
        draw.fillRect(x, rect.y, SPLITTER_DRAW_THICKNESS, rect.height);
      } else {
        const y = rect.y + rect.height / 2 - SPLITTER_DRAW_THICKNESS / 2;
        draw.fillRect(rect.x, y, rect.width, SPLITTER_DRAW_THICKNESS);
      }
    }
    draw.end();
  }

  // Render vehicle list UI
  const activePane = paneStates.get(activePaneId);
  const activeRect = layoutCache.rects.get(activePaneId);
  if (activePane && activeRect) {
    const activeBounds = activePane.camera.getVisibleBounds(activeRect.width, activeRect.height);
    const screenMatrix = getScreenMatrix(this.canvas.width, this.canvas.height);
    const vehicles = getVehiclesInViewport(aircraftRenderer.aircraft, activeBounds);

    uiContext.beginFrame({
      viewportWidth: this.canvas.width,
      viewportHeight: this.canvas.height,
      worldMatrix: activePane.camera.getMatrix(activeRect.width, activeRect.height),
      bounds: activeBounds,
    });

    uiContext.pushScreenSpace();

    // Vehicle list panel (uiScale defined at top of file)
    const listX = 20 * uiScale;
    const listY = 60 * uiScale;
    const listWidth = 260 * uiScale;
    const listHeight = Math.min(400 * uiScale, this.canvas.height - 80 * uiScale);
    const theme = uiContext.getTheme();

    // Panel header
    uiContext.fillRect(listX, listY - 24 * uiScale, listWidth, 24 * uiScale, theme.panel.background);
    uiContext.label(`Vehicles in View: ${vehicles.length}`, listX + 8 * uiScale, listY - 8 * uiScale, {
      fontSize: 12 * uiScale,
      color: [0.7, 0.7, 0.7, 1],
    });

    // Render the virtualized list
    const selectedIndex = vehicles.findIndex((v) => v.id === selectedVehicleId);
    virtualList(uiContext, {
      id: "vehicle-list",
      x: listX,
      y: listY,
      width: listWidth,
      height: listHeight,
      items: vehicles,
      itemHeight: 28 * uiScale,
      selectedIndex: selectedIndex >= 0 ? selectedIndex : undefined,
      renderItem: (vehicle, _index, itemRect, ui) => {
        const textY = itemRect.y + itemRect.height / 2 + 4 * uiScale;
        const padding = theme.list.itemPadding;

        // Callsign
        ui.label(vehicle.callsign, itemRect.x + padding, textY, {
          fontSize: 13 * uiScale,
          color: theme.list.itemTextColor,
        });

        // Altitude
        ui.label(vehicle.altitude, itemRect.x + 140 * uiScale, textY, {
          fontSize: 11 * uiScale,
          color: [0.6, 0.8, 0.6, 1],
        });

        // Velocity
        ui.label(vehicle.velocity, itemRect.x + 200 * uiScale, textY, {
          fontSize: 11 * uiScale,
          color: [0.6, 0.7, 0.9, 1],
        });
      },
      onSelect: (index, vehicle) => {
        selectedVehicleId = vehicle.id;
        // Center camera on selected vehicle
        activePane.camera.centerX = vehicle.aircraft.x;
        activePane.camera.centerY = vehicle.aircraft.y;
      },
    });

    uiContext.popCoordinateSpace();
    uiContext.endFrame();
  }

  this.requestRender();
};

// Start render loop
tessera.start();

console.log("Shapes loaded along US state borders (count will appear when loaded)");
