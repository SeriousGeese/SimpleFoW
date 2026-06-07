import { openDB } from './db.js';
import { state, setRenderFn, loadMap, startPan, applyPan, stopPan, isPanning,
         undo, redo, pushHistory, deleteShapes, setOnToolChange, resetPlayState } from './store.js';
import { initRenderer, render, getCanvasCoords } from './canvas/renderer.js';
import { toImage } from './canvas/layers.js';
import { hitTestShape, hitTestVertex, hitTestMidpoint, hitTestRotationHandle } from './canvas/hit.js';
import { hideMenu } from './ops/context-menu.js';
import { initToolbar, updateNoMapMsg, highlightTool } from './ui/toolbar.js';
import { refresh as refreshPicker, currentMapId } from './ui/map-picker.js';

import * as polygonTool from './tools/polygon-tool.js';
import * as circleTool  from './tools/circle-tool.js';
import * as doorTool    from './tools/door-tool.js';
import * as selectTool  from './tools/select-tool.js';
import * as playTool    from './tools/play-tool.js';

const canvas = document.getElementById('main-canvas');
let spaceHeld = false;

async function main() {
  await openDB();
  initRenderer(canvas);
  setRenderFn(render);
  initToolbar();

  // Keep toolbar button highlight in sync when tools change programmatically
  setOnToolChange(name => {
    highlightTool(name);
    if (name !== 'select') canvas.style.cursor = '';
  });

  await refreshPicker();
  const id = currentMapId();
  if (id) await loadMap(id);
  updateNoMapMsg();

  // ── mousedown ──────────────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', e => {
    // Middle button: pan in any mode/tool
    if (e.button === 1) { e.preventDefault(); startPan(e.clientX, e.clientY); canvas.style.cursor = 'grabbing'; return; }
    if (e.button !== 0) return;

    // Space held: pan regardless of active tool
    if (spaceHeld) { startPan(e.clientX, e.clientY); canvas.style.cursor = 'grabbing'; return; }

    // Play mode: left-click always pans (FoW only revealed by right-click)
    if (state.mode === 'play') { startPan(e.clientX, e.clientY); canvas.style.cursor = 'grabbing'; return; }

    // Edit mode
    hideMenu();

    // After drawing a shape the tool auto-switches to 'select' with returnTool set.
    // If the click misses the selected shape (body + handles), reactivate the draw tool.
    if (state.activeTool === 'select' && state.returnTool) {
      const [sx, sy] = getCanvasCoords(e);
      if (!hitsCurrentSelection(sx, sy)) {
        const tool = state.returnTool;
        state.returnTool = null;
        state.activeTool = tool;
        state.selectedIds = new Set();
        state.drawing = { active: false, points: [], previewPoint: null };
        highlightTool(tool);
        if (tool === 'polygon') { polygonTool.onMouseDown(e); return; }
        if (tool === 'circle')  { circleTool.onMouseDown(e);  return; }
        if (tool === 'door')    { doorTool.onMouseDown(e);    return; }
      }
    }

    if (state.activeTool === 'polygon') polygonTool.onMouseDown(e);
    if (state.activeTool === 'circle')  circleTool.onMouseDown(e);
    if (state.activeTool === 'door')    doorTool.onMouseDown(e);
    if (state.activeTool === 'select')  selectTool.onMouseDown(e);
  });

  // ── mousemove ──────────────────────────────────────────────────────────────

  canvas.addEventListener('mousemove', e => {
    // Pan always runs first (middle button, space, play mode, or select-tool empty drag)
    applyPan(e.clientX, e.clientY);
    if (state.mode === 'play') {
      if (!isPanning()) playTool.updateCursor(e);
      return;
    }
    if (isPanning()) return; // suppress tool preview while panning

    if (state.activeTool === 'polygon') polygonTool.onMouseMove(e);
    if (state.activeTool === 'circle')  circleTool.onMouseMove(e);
    if (state.activeTool === 'door')    doorTool.onMouseMove(e);
    if (state.activeTool === 'select') {
      selectTool.onMouseMove(e);
      if (!spaceHeld) selectTool.updateCursor(e);
    }
  });

  // ── mouseup ────────────────────────────────────────────────────────────────

  canvas.addEventListener('mouseup', async e => {
    const wasPanning = isPanning();
    stopPan();
    if (wasPanning) canvas.style.cursor = spaceHeld ? 'grab' : '';
    if (state.mode === 'play') return;
    if (wasPanning) return; // don't commit a draw if we panned

    if (state.activeTool === 'polygon') await polygonTool.onMouseUp(e);
    if (state.activeTool === 'circle')  await circleTool.onMouseUp(e);
    if (state.activeTool === 'door')    await doorTool.onMouseUp(e);
    if (state.activeTool === 'select')  await selectTool.onMouseUp(e);
  });

  // ── contextmenu ────────────────────────────────────────────────────────────

  canvas.addEventListener('contextmenu', e => {
    if (state.mode === 'play') { playTool.onContextMenu(e); return; }
    if (state.activeTool === 'select') selectTool.onContextMenu(e);
    else e.preventDefault();
  });

  // ── zoom ───────────────────────────────────────────────────────────────────

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [sx, sy] = getCanvasCoords(e);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const vp = state.viewport;
    const newScale = Math.max(0.05, Math.min(20, vp.scale * factor));
    state.viewport = {
      scale: newScale,
      x: sx - (sx - vp.x) * (newScale / vp.scale),
      y: sy - (sy - vp.y) * (newScale / vp.scale),
    };
    render();
  }, { passive: false });

  // ── keyboard ───────────────────────────────────────────────────────────────

  window.addEventListener('keydown', async e => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;

    if (e.code === 'Escape') { hideMenu(); return; }

    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceHeld) { spaceHeld = true; canvas.style.cursor = 'grab'; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); await undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); await redo(); return; }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (confirm('Reset play state? All revealed areas will be re-hidden and all doors will be closed.')) {
        await resetPlayState();
      }
      return;
    }

    // Delete selected shapes in edit mode
    if (e.key === 'Delete' && state.mode === 'edit' && state.selectedIds.size > 0) {
      e.preventDefault();
      pushHistory();
      await deleteShapes([...state.selectedIds]);
      return;
    }

    // Merge selected shapes in edit mode
    if (e.key.toLowerCase() === 'm' && state.mode === 'edit' && state.selectedIds.size >= 2) {
      e.preventDefault();
      await selectTool.doMerge();
      return;
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceHeld = false; canvas.style.cursor = ''; }
  });

  // ── close context menu on outside click ────────────────────────────────────

  document.addEventListener('mousedown', e => {
    if (!document.getElementById('ctx-menu').contains(e.target)) hideMenu();
  });
}

// Returns true if screen-space point (sx,sy) overlaps any selected shape's body or handles
function hitsCurrentSelection(sx, sy) {
  if (state.selectedIds.size === 0) return false;
  const imgPt = toImage([sx, sy], state.viewport);
  const t = 8 / state.viewport.scale;
  for (const id of state.selectedIds) {
    const shape = state.shapes.find(s => s.id === id);
    if (!shape) continue;
    if (hitTestShape([shape], imgPt[0], imgPt[1])) return true;
    if (hitTestVertex(shape, imgPt[0], imgPt[1], t)) return true;
    if (hitTestMidpoint(shape, imgPt[0], imgPt[1], t)) return true;
    if (shape.type === 'door' && hitTestRotationHandle(shape, sx, sy, state.viewport)) return true;
  }
  return false;
}

main();
