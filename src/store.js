import * as db from './db.js';

export const state = {
  mode: 'edit',
  currentMapId: null,
  mapImage: null,
  shapes: [],
  fowState: new Map(),
  selectedIds: new Set(),
  activeTool: 'select',
  returnTool: null,   // drawing tool to reactivate on next empty-space click
  viewport: { x: 0, y: 0, scale: 1 },
  drawing: { active: false, points: [], previewPoint: null },
};

let _renderFn = null;
export function setRenderFn(fn) { _renderFn = fn; }
export function render() { if (_renderFn) _renderFn(); }

let _onToolChange = null;
export function setOnToolChange(fn) { _onToolChange = fn; }

// Called by drawing tools after creating a shape — auto-selects it and arms returnTool
export function afterDraw(newId, tool) {
  state.returnTool = tool;
  state.activeTool = 'select';
  state.selectedIds = new Set([newId]);
  state.drawing = { active: false, points: [], previewPoint: null };
  if (_onToolChange) _onToolChange('select');
  render();
}

// ── Pan ───────────────────────────────────────────────────────────────────────

const _pan = { active: false, mx: 0, my: 0, vx: 0, vy: 0 };

export function startPan(clientX, clientY) {
  _pan.active = true;
  _pan.mx = clientX;
  _pan.my = clientY;
  _pan.vx = state.viewport.x;
  _pan.vy = state.viewport.y;
}

export function applyPan(clientX, clientY) {
  if (!_pan.active) return false;
  state.viewport = {
    ...state.viewport,
    x: _pan.vx + clientX - _pan.mx,
    y: _pan.vy + clientY - _pan.my,
  };
  render();
  return true;
}

export function stopPan() {
  _pan.active = false;
}

export function isPanning() {
  return _pan.active;
}

// ── Undo / Redo ───────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;
const undoStack = [];
const redoStack = [];

function snapshot() {
  return {
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    fowState: new Map(state.fowState),
  };
}

export function pushHistory() {
  if (!state.currentMapId) return;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

export function captureSnapshot() {
  return snapshot();
}

export function pushSnapshotToUndo(snap) {
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

export async function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshot());
  await applySnapshot(undoStack.pop());
}

export async function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshot());
  await applySnapshot(redoStack.pop());
}

async function applySnapshot({ shapes, fowState }) {
  await db.syncShapes(state.currentMapId, shapes);
  await db.syncFowState(state.currentMapId, fowState);
  state.shapes = shapes;
  state.fowState = fowState;
  state.selectedIds = new Set();
  render();
}

// ── Map loading ───────────────────────────────────────────────────────────────

export async function loadMap(mapId) {
  undoStack.length = 0;
  redoStack.length = 0;
  if (!mapId) {
    state.currentMapId = null;
    state.mapImage = null;
    state.shapes = [];
    state.fowState = new Map();
    state.selectedIds = new Set();
    render();
    return;
  }
  const record = await db.getMap(mapId);
  if (!record) return;

  const url = URL.createObjectURL(record.blob);
  const img = new Image();
  await new Promise(res => { img.onload = res; img.src = url; });
  URL.revokeObjectURL(url);

  state.currentMapId = mapId;
  state.mapImage = img;
  state.shapes = await db.getShapesForMap(mapId);
  state.fowState = await db.getFowState(mapId);
  state.selectedIds = new Set();
  fitViewport(img.naturalWidth, img.naturalHeight);
  if (state.mode === 'play') await _revealStartingArea();
  render();
}

function fitViewport(imgW, imgH) {
  const wrap = document.getElementById('canvas-wrap');
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  const scale = Math.min(cw / imgW, ch / imgH, 1);
  state.viewport = {
    x: (cw - imgW * scale) / 2,
    y: (ch - imgH * scale) / 2,
    scale,
  };
}

// ── Mode ──────────────────────────────────────────────────────────────────────

export async function setMode(mode) {
  state.mode = mode;
  state.selectedIds = new Set();
  state.drawing = { active: false, points: [], previewPoint: null };
  stopPan();
  if (mode === 'play') await _revealStartingArea();
  render();
}

async function _revealStartingArea() {
  const shape = state.shapes.find(s => s.startingArea);
  if (shape && !state.fowState.get(shape.id)) {
    state.fowState.set(shape.id, true);
    await db.setFowRevealed(state.currentMapId, shape.id, true);
  }
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export function setTool(name) {
  state.activeTool = name;
  state.returnTool = null; // explicit tool switch clears the auto-return
  state.drawing = { active: false, points: [], previewPoint: null };
  state.selectedIds = new Set();
  stopPan();
  if (_onToolChange) _onToolChange(name);
  render();
}

// ── Shapes ────────────────────────────────────────────────────────────────────

export async function addShape(shape) {
  const id = await db.saveShape({ ...shape, mapId: state.currentMapId });
  state.shapes.push({ ...shape, id, mapId: state.currentMapId });
  render();
  return id;
}

export async function updateShape(shape) {
  await db.updateShape(shape);
  const i = state.shapes.findIndex(s => s.id === shape.id);
  if (i >= 0) state.shapes[i] = shape;
  render();
}

export async function deleteShape(id) {
  await db.deleteShape(id);
  await db.deleteFowEntry(state.currentMapId, id);
  state.shapes = state.shapes.filter(s => s.id !== id);
  state.fowState.delete(id);
  state.selectedIds.delete(id);
  render();
}

export async function deleteShapes(ids) {
  for (const id of ids) await deleteShape(id);
}

// ── FoW ───────────────────────────────────────────────────────────────────────

export async function resetPlayState() {
  pushHistory();
  state.fowState = new Map();
  const startingShape = state.shapes.find(s => s.startingArea);
  if (startingShape) state.fowState.set(startingShape.id, true);
  await db.syncFowState(state.currentMapId, state.fowState);
  render();
}

export async function setStartingArea(id) {
  const existing = state.shapes.find(s => s.startingArea);
  if (existing && existing.id !== id) {
    existing.startingArea = false;
    await db.updateShape(existing);
  }
  const shape = state.shapes.find(s => s.id === id);
  if (shape) {
    shape.startingArea = true;
    await db.updateShape(shape);
  }
  render();
}

export async function clearStartingArea(id) {
  const shape = state.shapes.find(s => s.id === id);
  if (!shape) return;
  shape.startingArea = false;
  await db.updateShape(shape);
  render();
}

export async function toggleRevealed(shapeId) {
  pushHistory();
  const current = state.fowState.get(shapeId) ?? false;
  const next = !current;
  state.fowState.set(shapeId, next);
  await db.setFowRevealed(state.currentMapId, shapeId, next);
  render();
}

// ── Selection ─────────────────────────────────────────────────────────────────

export function selectShape(id, addToSelection = false) {
  if (addToSelection) {
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
  } else {
    state.selectedIds = new Set([id]);
  }
  render();
}

export function clearSelection() {
  state.selectedIds = new Set();
  render();
}
