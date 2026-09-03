import { state, setMode, setTool } from '../store.js';
import * as db from '../db.js';
import { refresh as refreshPicker, currentMapId } from './map-picker.js';
import { loadMap } from '../store.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  if (!header || data === undefined) throw new Error('Invalid image data');
  const match = header.match(/^data:([^;]+);base64$/);
  if (!match) throw new Error('Unsupported image data');
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

async function exportProject() {
  const maps = await db.getMaps();
  const exportedMaps = [];
  for (const map of maps) {
    const shapes = await db.getShapesForMap(map.id);
    const fowState = await db.getFowState(map.id);
    exportedMaps.push({
      name: map.name,
      width: map.width,
      height: map.height,
      createdAt: map.createdAt,
      image: await blobToDataUrl(map.blob),
      shapes,
      fowState: [...fowState],
    });
  }
  downloadBlob(
    new Blob([JSON.stringify({ format: 'simplefow-project', version: 1, maps: exportedMaps })], { type: 'application/json' }),
    `simplefow-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

async function importProject(file) {
  const project = JSON.parse(await file.text());
  if (project.format !== 'simplefow-project' || project.version !== 1 || !Array.isArray(project.maps)) {
    throw new Error('This is not a supported SimpleFoW project file');
  }
  for (const map of project.maps) {
    if (!map.name || !map.image || !Array.isArray(map.shapes) || !Array.isArray(map.fowState)) {
      throw new Error('The project file contains an invalid map');
    }
    await db.importMap(
      { name: map.name, blob: dataUrlToBlob(map.image), width: map.width, height: map.height, createdAt: map.createdAt },
      map.shapes,
      new Map(map.fowState),
    );
  }
  return project.maps.length;
}

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

  document.getElementById('btn-export-project').addEventListener('click', async () => {
    try {
      await exportProject();
    } catch (error) {
      alert(`Could not export project: ${error.message}`);
    }
  });

  document.getElementById('btn-import-project').addEventListener('click', () => {
    document.getElementById('project-import').click();
  });
  document.getElementById('project-import').addEventListener('change', async e => {
    const [file] = e.target.files;
    if (!file) return;
    try {
      const importedMapCount = await importProject(file);
      await refreshPicker();
      const id = currentMapId();
      if (id) await loadMap(id);
      updateNoMapMsg();
      alert(`Imported ${importedMapCount} map${importedMapCount === 1 ? '' : 's'}. Existing maps were kept.`);
    } catch (error) {
      alert(`Could not import project: ${error.message}`);
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-export-view').addEventListener('click', () => {
    const canvas = document.getElementById('main-canvas');
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `simplefow-view-${new Date().toISOString().slice(0, 10)}.png`);
    }, 'image/png');
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
