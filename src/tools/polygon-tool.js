import { state, addShape, pushHistory, render, afterDraw } from '../store.js';
import { getCanvasCoords } from '../canvas/renderer.js';
import { toImage } from '../canvas/layers.js';
import { rectFromCorners } from '../ops/geometry.js';

let startPt = null;

export function onMouseDown(e) {
  if (e.button !== 0) return;
  const [sx, sy] = getCanvasCoords(e);
  startPt = toImage([sx, sy], state.viewport);
  state.drawing.active = true;
  state.drawing.points = [startPt];
  state.drawing.previewPoint = startPt;
}

export function onMouseMove(e) {
  if (!state.drawing.active || !startPt) return;
  const [sx, sy] = getCanvasCoords(e);
  state.drawing.previewPoint = toImage([sx, sy], state.viewport);
  render();
}

export async function onMouseUp(e) {
  if (!state.drawing.active || !startPt) return;
  const [sx, sy] = getCanvasCoords(e);
  const endPt = toImage([sx, sy], state.viewport);
  const w = Math.abs(endPt[0] - startPt[0]);
  const h = Math.abs(endPt[1] - startPt[1]);
  if (w > 4 && h > 4) {
    pushHistory();
    const newId = await addShape({ type: 'polygon', points: rectFromCorners(startPt, endPt) });
    startPt = null;
    afterDraw(newId, 'polygon');
    return;
  }
  startPt = null;
  state.drawing = { active: false, points: [], previewPoint: null };
}
