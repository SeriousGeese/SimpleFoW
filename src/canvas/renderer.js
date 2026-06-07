import { state } from '../store.js';
import { drawMap, drawFow, drawShapes, drawDoors, drawHandles, drawDrawingPreview } from './layers.js';

let canvas, ctx, fowCanvas, fowCtx;

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  fowCanvas = document.createElement('canvas');
  fowCtx = fowCanvas.getContext('2d');

  const ro = new ResizeObserver(() => {
    resizeCanvas();
    render();
  });
  ro.observe(canvas.parentElement);
  resizeCanvas();
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = wrap.clientWidth  * dpr;
  canvas.height = wrap.clientHeight * dpr;
  canvas.style.width  = wrap.clientWidth  + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fowCanvas.width  = wrap.clientWidth;
  fowCanvas.height = wrap.clientHeight;
}

export function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

export function render() {
  const W = canvas.width  / (window.devicePixelRatio || 1);
  const H = canvas.height / (window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, W, H);

  if (!state.mapImage) return;

  const vp = state.viewport;
  drawMap(ctx, state.mapImage, vp);

  if (state.mode === 'play') {
    drawFow(fowCtx, state.shapes, state.fowState, vp, W, H);
    ctx.drawImage(fowCanvas, 0, 0);
    drawDoors(ctx, state.shapes, state.fowState, 'play', null, vp);
    // Brown border so the GM can see the map boundary
    const mw = state.mapImage.naturalWidth  * vp.scale;
    const mh = state.mapImage.naturalHeight * vp.scale;
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth   = 3;
    ctx.strokeRect(vp.x, vp.y, mw, mh);
  } else {
    drawShapes(ctx, state.shapes, state.selectedIds, vp);
    drawDoors(ctx, state.shapes, state.fowState, 'edit', state.selectedIds, vp);
    drawHandles(ctx, state.shapes, state.selectedIds, state.activeTool, vp);
    drawDrawingPreview(ctx, state.drawing, state.activeTool, vp);
  }
}
