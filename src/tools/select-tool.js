import { state, selectShape, clearSelection, updateShape, deleteShape, deleteShapes, addShape, render,
         startPan, isPanning, captureSnapshot, pushSnapshotToUndo, pushHistory,
         setStartingArea, clearStartingArea } from '../store.js';
import { getCanvasCoords } from '../canvas/renderer.js';
import { toImage } from '../canvas/layers.js';
import { hitTestShape, hitTestVertex, hitTestMidpoint, hitTestRotationHandle } from '../canvas/hit.js';
import { showMenu, hideMenu } from '../ops/context-menu.js';
import { mergeShapes } from '../ops/merge.js';
import { centroid, edgeMidpoint, scaleRectFromAnchor, rotatePoints } from '../ops/geometry.js';

let drag = null;
let preActionSnap = null; // snapshot taken at drag-start, pushed to undo on mouseup

export function onMouseDown(e) {
  if (e.button !== 0) return;
  hideMenu();
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);
  const vp = state.viewport;
  const t = 8 / vp.scale; // screen-pixel threshold in image space

  // Check rotation handle first (door)
  for (const id of state.selectedIds) {
    const shape = state.shapes.find(s => s.id === id);
    if (shape?.type === 'door' && hitTestRotationHandle(shape, sx, sy, vp)) {
      preActionSnap = captureSnapshot();
      drag = { type: 'rotate', shape: { ...shape } };
      return;
    }
  }

  // Check vertex / midpoint on selected shapes
  for (const id of state.selectedIds) {
    const shape = state.shapes.find(s => s.id === id);
    if (!shape) continue;

    const vHit = hitTestVertex(shape, imgPt[0], imgPt[1], t);
    if (vHit) {
      preActionSnap = captureSnapshot();
      if (vHit.type === 'circle-center') {
        drag = { type: 'circle-center', shape: { ...shape } };
      } else if (vHit.type === 'circle-resize') {
        drag = { type: 'circle-resize', shape: { ...shape } };
      } else {
        if (e.shiftKey && shape.points.length === 4) {
          const anchorIdx = (vHit.index + 2) % 4;
          drag = { type: 'scale-rect', shape: { ...shape }, anchorIdx };
        } else if (shape.type === 'door') {
          drag = { type: 'door-vertex', shape: { ...shape }, index: vHit.index };
        } else {
          drag = { type: 'vertex', shape: { ...shape }, index: vHit.index };
        }
      }
      return;
    }

    const mHit = hitTestMidpoint(shape, imgPt[0], imgPt[1], t);
    if (mHit) {
      preActionSnap = captureSnapshot();
      const pts = [...shape.points];
      const mid = edgeMidpoint(pts[mHit.edgeIndex], pts[(mHit.edgeIndex + 1) % pts.length]);
      pts.splice(mHit.edgeIndex + 1, 0, mid);
      drag = { type: 'vertex', shape: { ...shape, points: pts }, index: mHit.edgeIndex + 1 };
      return;
    }
  }

  // Hit test shapes
  const hit = hitTestShape(state.shapes, imgPt[0], imgPt[1]);
  if (hit) {
    selectShape(hit.id, e.ctrlKey || e.metaKey);
    preActionSnap = captureSnapshot();
    drag = { type: 'move', startImg: imgPt, origShapes: buildOrigShapes() };
    return;
  }

  // Click empty space — pan
  if (!e.ctrlKey && !e.metaKey) clearSelection();
  startPan(e.clientX, e.clientY);
  document.getElementById('main-canvas').style.cursor = 'grabbing';
  drag = { type: 'pan' };
}

export function updateCursor(e) {
  const canvas = document.getElementById('main-canvas');
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);
  const vp = state.viewport;
  const t = 8 / vp.scale;

  for (const id of state.selectedIds) {
    const shape = state.shapes.find(s => s.id === id);
    if (!shape) continue;
    if (shape.type === 'door' && hitTestRotationHandle(shape, sx, sy, vp)) { canvas.style.cursor = 'pointer'; return; }
    if (hitTestVertex(shape, imgPt[0], imgPt[1], t)) { canvas.style.cursor = 'pointer'; return; }
    if (hitTestMidpoint(shape, imgPt[0], imgPt[1], t)) { canvas.style.cursor = 'pointer'; return; }
  }

  const hit = hitTestShape(state.shapes, imgPt[0], imgPt[1]);
  canvas.style.cursor = hit ? 'pointer' : 'default';
}

export function onMouseMove(e) {
  if (!drag || drag.type === 'pan') return; // pan is handled in main.js
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);

  if (drag.type === 'vertex') {
    const pts = drag.shape.points.map((p, i) => i === drag.index ? imgPt : p);
    applyShapeUpdate({ ...drag.shape, points: pts });
  } else if (drag.type === 'door-vertex') {
    const c = centroid(drag.shape.points);
    const unrotated = rotatePoints([imgPt], -(drag.shape.rotation ?? 0), c)[0];
    const pts = drag.shape.points.map((p, i) => i === drag.index ? unrotated : p);
    applyShapeUpdate({ ...drag.shape, points: pts });
  } else if (drag.type === 'scale-rect') {
    const anchor = drag.shape.points[drag.anchorIdx];
    applyShapeUpdate({ ...drag.shape, points: scaleRectFromAnchor(anchor, imgPt) });
  } else if (drag.type === 'circle-center') {
    applyShapeUpdate({ ...drag.shape, cx: imgPt[0], cy: imgPt[1] });
  } else if (drag.type === 'circle-resize') {
    const r = Math.hypot(imgPt[0] - drag.shape.cx, imgPt[1] - drag.shape.cy);
    applyShapeUpdate({ ...drag.shape, radius: Math.max(5, r) });
  } else if (drag.type === 'rotate') {
    const c = centroid(drag.shape.points);
    const angle = Math.atan2(imgPt[1] - c[1], imgPt[0] - c[0]) + Math.PI / 2;
    applyShapeUpdate({ ...drag.shape, rotation: angle });
  } else if (drag.type === 'move') {
    const dx = imgPt[0] - drag.startImg[0];
    const dy = imgPt[1] - drag.startImg[1];
    for (const id of state.selectedIds) {
      const orig = drag.origShapes.find(s => s.id === id);
      if (!orig) continue;
      let updated;
      if (orig.type === 'circle') {
        updated = { ...orig, cx: orig.cx + dx, cy: orig.cy + dy };
      } else {
        updated = { ...orig, points: orig.points.map(([x, y]) => [x + dx, y + dy]) };
      }
      applyShapeUpdate(updated);
    }
  }
}

export async function onMouseUp() {
  if (!drag) return;
  const modifying = ['vertex', 'door-vertex', 'scale-rect', 'circle-center', 'circle-resize', 'rotate', 'move'];
  if (modifying.includes(drag.type) && preActionSnap) {
    pushSnapshotToUndo(preActionSnap);
    for (const shape of state.shapes) {
      if (state.selectedIds.has(shape.id)) await updateShape(shape);
    }
  }
  drag = null;
  preActionSnap = null;
}

export function onContextMenu(e) {
  e.preventDefault();
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);
  const hit = hitTestShape(state.shapes, imgPt[0], imgPt[1]);

  if (hit && !state.selectedIds.has(hit.id)) selectShape(hit.id, false);

  const selCount = state.selectedIds.size;
  if (selCount === 0 && !hit) return;

  const items = [];

  if (selCount === 1) {
    const shape = state.shapes.find(s => state.selectedIds.has(s.id));
    if (shape && shape.type !== 'door') {
      if (shape.startingArea) {
        items.push({ label: '★ Remove Starting Area', action: () => clearStartingArea(shape.id) });
      } else {
        items.push({ label: '★ Mark as Starting Area', action: () => setStartingArea(shape.id) });
      }
      items.push('sep');
    }
  }

  if (selCount >= 2) {
    items.push({ label: 'Merge shapes', action: doMerge });
    items.push('sep');
  }
  items.push({ label: selCount > 1 ? `Delete ${selCount} shapes` : 'Delete shape', danger: true, action: doDelete });
  showMenu(e.clientX, e.clientY, items);
}

export async function doMerge() {
  const selected = state.shapes.filter(s => state.selectedIds.has(s.id));
  const merged = mergeShapes(selected);
  if (!merged) return;
  pushHistory();
  await deleteShapes([...state.selectedIds]);
  await addShape({ type: 'polygon', points: merged });
}

async function doDelete() {
  pushHistory();
  await deleteShapes([...state.selectedIds]);
}

function applyShapeUpdate(updated) {
  const i = state.shapes.findIndex(s => s.id === updated.id);
  if (i >= 0) state.shapes[i] = updated;
  render();
}

function buildOrigShapes() {
  return state.shapes
    .filter(s => state.selectedIds.has(s.id))
    .map(s => JSON.parse(JSON.stringify(s)));
}
