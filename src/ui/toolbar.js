import { state, setMode, setTool } from '../store.js';
import * as db from '../db.js';
import { refresh as refreshPicker, currentMapId } from './map-picker.js';
import { loadMap } from '../store.js';

export function initToolbar() {
  // Mode toggle
  const modeBtn = document.getElementById('btn-mode-toggle');
  modeBtn.addEventListener('click', () => {
    const next = state.mode === 'edit' ? 'play' : 'edit';
    setMode(next);
    document.getElementById('main-canvas').style.cursor = '';
    modeBtn.textContent = next === 'play' ? '✏ Edit Mode' : '▶ Play Mode';
    modeBtn.classList.toggle('play-active', next === 'play');
    document.getElementById('edit-tools').classList.toggle('hidden', next === 'play');
    document.getElementById('play-hint').classList.toggle('hidden', next !== 'play');
  });

  // Upload
  const fileInput = document.getElementById('file-upload');
  document.getElementById('btn-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise(res => { img.onload = res; img.src = url; });
      URL.revokeObjectURL(url);
      const id = await db.saveMap({
        name: file.name,
        blob: file,
        width: img.naturalWidth,
        height: img.naturalHeight,
        createdAt: Date.now(),
      });
      await refreshPicker();
      document.getElementById('map-picker').value = id;
      await loadMap(id);
    }
    fileInput.value = '';
    updateNoMapMsg();
    // Always land in edit mode after uploading
    if (state.mode !== 'edit') {
      setMode('edit');
      const modeBtn = document.getElementById('btn-mode-toggle');
      modeBtn.textContent = '▶ Play Mode';
      modeBtn.classList.remove('play-active');
      document.getElementById('edit-tools').classList.remove('hidden');
      document.getElementById('play-hint').classList.add('hidden');
    }
  });

  // Delete map
  document.getElementById('btn-delete-map').addEventListener('click', async () => {
    const id = currentMapId();
    if (!id) return;
    if (!confirm('Delete this map and all its shapes?')) return;
    await db.deleteMap(id);
    await refreshPicker();
    const newId = currentMapId();
    await loadMap(newId);
    updateNoMapMsg();
  });

  // Tool buttons
  const tools = ['select', 'polygon', 'circle', 'door'];
  for (const name of tools) {
    document.getElementById(`tool-${name}`).addEventListener('click', () => {
      setTool(name);
      tools.forEach(t => document.getElementById(`tool-${t}`).classList.toggle('active', t === name));
    });
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (state.mode !== 'edit') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // let main.js handle Ctrl+Z/Y etc.
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    const map = { s: 'select', p: 'polygon', c: 'circle', d: 'door' };
    if (map[e.key.toLowerCase()]) {
      setTool(map[e.key.toLowerCase()]);
      tools.forEach(t => document.getElementById(`tool-${t}`).classList.toggle('active', t === map[e.key.toLowerCase()]));
    }
    if (e.key === 'Escape') {
      state.drawing = { active: false, points: [], previewPoint: null };
      setTool('select');
      tools.forEach(t => document.getElementById(`tool-${t}`).classList.toggle('active', t === 'select'));
    }
  });
}

export function updateNoMapMsg() {
  const msg = document.getElementById('no-map-msg');
  msg.classList.toggle('hidden', !!state.mapImage);
}

export function highlightTool(name) {
  const tools = ['select', 'polygon', 'circle', 'door'];
  tools.forEach(t => document.getElementById(`tool-${t}`)?.classList.toggle('active', t === name));
}
