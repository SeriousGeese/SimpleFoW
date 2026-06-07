import { state, addShape, pushHistory, render, afterDraw } from '../store.js';
import { getCanvasCoords } from '../canvas/renderer.js';
import { toImage } from '../canvas/layers.js';
import { distance } from '../ops/geometry.js';

let center = null;

export function onMouseDown(e) {
  if (e.button !== 0) return;
  const [sx, sy] = getCanvasCoords(e);
  center = toImage([sx, sy], state.viewport);
  state.drawing.active = true;
  state.drawing.points = [center];
  state.drawing.previewPoint = center;
}

export function onMouseMove(e) {
  if (!state.drawing.active || !center) return;
  const [sx, sy] = getCanvasCoords(e);
  state.drawing.previewPoint = toImage([sx, sy], state.viewport);
  render();
}

export async function onMouseUp(e) {
  if (!state.drawing.active || !center) return;
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);
  const r = distance(center, imgPt);
  if (r > 5) {
    pushHistory();
    const newId = await addShape({ type: 'circle', cx: center[0], cy: center[1], radius: r, points: [] });
    center = null;
    afterDraw(newId, 'circle');
    return;
  }
  center = null;
  state.drawing = { active: false, points: [], previewPoint: null };
}
