import { state, toggleRevealed } from '../store.js';
import { getCanvasCoords } from '../canvas/renderer.js';
import { toImage } from '../canvas/layers.js';
import { hitTestShape, isDoorVisible } from '../canvas/hit.js';
import { showMenu, hideMenu } from '../ops/context-menu.js';

export function updateCursor(e) {
  const canvas = document.getElementById('main-canvas');
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);

  const overDoor = state.shapes.some(
    s => s.type === 'door' && isDoorVisible(s, state.shapes, state.fowState) &&
         hitTestShape([s], imgPt[0], imgPt[1])
  );
  if (overDoor) { canvas.style.cursor = 'pointer'; return; }

  const overShape = hitTestShape(state.shapes.filter(s => s.type !== 'door'), imgPt[0], imgPt[1]);
  canvas.style.cursor = overShape ? 'pointer' : 'default';
}

export function onContextMenu(e) {
  e.preventDefault();
  hideMenu();
  const [sx, sy] = getCanvasCoords(e);
  const imgPt = toImage([sx, sy], state.viewport);

  // Check visible doors first (they sit on top)
  const visibleDoors = state.shapes.filter(
    s => s.type === 'door' && isDoorVisible(s, state.shapes, state.fowState)
  );
  const doorHit = hitTestShape(visibleDoors, imgPt[0], imgPt[1]);
  if (doorHit) {
    const open = state.fowState.get(doorHit.id) ?? false;
    showMenu(e.clientX, e.clientY, [
      {
        label: open ? '🚪 Close door' : '🚪 Open door',
        action: () => toggleRevealed(doorHit.id),
      },
    ]);
    return;
  }

  const hit = hitTestShape(
    state.shapes.filter(s => s.type !== 'door'),
    imgPt[0], imgPt[1]
  );
  if (!hit) return;

  const revealed = state.fowState.get(hit.id) ?? false;
  showMenu(e.clientX, e.clientY, [
    {
      label: revealed ? '🌑 Re-fog area' : '☀ Reveal area',
      action: () => toggleRevealed(hit.id),
    },
  ]);
}
