import * as db from '../db.js';
import { loadMap, state } from '../store.js';

const picker = document.getElementById('map-picker');

export async function refresh() {
  const maps = await db.getMaps();
  const prev = picker.value;
  picker.innerHTML = '';
  if (maps.length === 0) {
    picker.innerHTML = '<option value="">— no maps —</option>';
    return;
  }
  for (const m of maps) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    picker.appendChild(opt);
  }
  // restore previous selection or pick first
  if (prev && maps.find(m => m.id == prev)) picker.value = prev;
  else picker.value = maps[0].id;
}

picker.addEventListener('change', () => {
  const id = Number(picker.value);
  if (id) loadMap(id);
});

export function currentMapId() {
  return Number(picker.value) || null;
}
