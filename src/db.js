const DB_NAME = 'simplefow';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('maps')) {
        db.createObjectStore('maps', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('shapes')) {
        const ss = db.createObjectStore('shapes', { keyPath: 'id', autoIncrement: true });
        ss.createIndex('mapId', 'mapId', { unique: false });
      }
      if (!db.objectStoreNames.contains('fowState')) {
        db.createObjectStore('fowState', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function req2p(r) {
  return new Promise((res, rej) => { r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });
}

// ── Maps ──────────────────────────────────────────────────────────────────────

export async function saveMap(record) {
  return req2p(tx('maps', 'readwrite').add(record));
}

export async function getMaps() {
  return req2p(tx('maps').getAll());
}

export async function getMap(id) {
  return req2p(tx('maps').get(id));
}

export async function deleteMap(id) {
  const db = _db;
  await req2p(db.transaction('maps', 'readwrite').objectStore('maps').delete(id));
  // cascade: delete shapes
  const shapes = await getShapesForMap(id);
  const shapeTx = db.transaction(['shapes', 'fowState'], 'readwrite');
  const shapeStore = shapeTx.objectStore('shapes');
  const fowStore = shapeTx.objectStore('fowState');
  for (const s of shapes) {
    shapeStore.delete(s.id);
    fowStore.delete(`${id}:${s.id}`);
  }
  return new Promise((res, rej) => {
    shapeTx.oncomplete = res;
    shapeTx.onerror = e => rej(e.target.error);
  });
}

// ── Shapes ────────────────────────────────────────────────────────────────────

export async function saveShape(shape) {
  return req2p(tx('shapes', 'readwrite').add(shape));
}

export async function getShapesForMap(mapId) {
  return new Promise((resolve, reject) => {
    const store = tx('shapes');
    const index = store.index('mapId');
    const results = [];
    const cursor = index.openCursor(IDBKeyRange.only(mapId));
    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { results.push(c.value); c.continue(); }
      else resolve(results);
    };
    cursor.onerror = e => reject(e.target.error);
  });
}

export async function updateShape(shape) {
  return req2p(tx('shapes', 'readwrite').put(shape));
}

export async function deleteShape(id) {
  return req2p(tx('shapes', 'readwrite').delete(id));
}

// ── FoW State ─────────────────────────────────────────────────────────────────

export async function getFowState(mapId) {
  return new Promise((resolve, reject) => {
    const store = tx('fowState');
    const results = new Map();
    const prefix = `${mapId}:`;
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const cursor = store.openCursor(range);
    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { results.set(c.value.shapeId, c.value.revealed); c.continue(); }
      else resolve(results);
    };
    cursor.onerror = e => reject(e.target.error);
  });
}

export async function setFowRevealed(mapId, shapeId, revealed) {
  return req2p(tx('fowState', 'readwrite').put({ key: `${mapId}:${shapeId}`, mapId, shapeId, revealed }));
}

export async function deleteFowEntry(mapId, shapeId) {
  return req2p(tx('fowState', 'readwrite').delete(`${mapId}:${shapeId}`));
}

// ── Undo/redo sync ────────────────────────────────────────────────────────────

export async function syncShapes(mapId, shapes) {
  // delete all shapes for this map then re-insert from snapshot
  await new Promise((res, rej) => {
    const t = _db.transaction('shapes', 'readwrite');
    const store = t.objectStore('shapes');
    const cursor = store.index('mapId').openCursor(IDBKeyRange.only(mapId));
    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { store.delete(c.primaryKey); c.continue(); }
    };
    t.oncomplete = res;
    t.onerror = e => rej(e.target.error);
  });
  const t2 = _db.transaction('shapes', 'readwrite');
  const store2 = t2.objectStore('shapes');
  for (const s of shapes) store2.put(s);
  return new Promise((res, rej) => { t2.oncomplete = res; t2.onerror = e => rej(e.target.error); });
}

export async function syncFowState(mapId, fowStateMap) {
  const prefix = `${mapId}:`;
  const range = IDBKeyRange.bound(prefix, prefix + '￿');
  await new Promise((res, rej) => {
    const t = _db.transaction('fowState', 'readwrite');
    const store = t.objectStore('fowState');
    const cursor = store.openCursor(range);
    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { store.delete(c.key); c.continue(); }
    };
    t.oncomplete = res;
    t.onerror = e => rej(e.target.error);
  });
  const t2 = _db.transaction('fowState', 'readwrite');
  const store2 = t2.objectStore('fowState');
  for (const [shapeId, revealed] of fowStateMap) {
    store2.put({ key: `${mapId}:${shapeId}`, mapId, shapeId, revealed });
  }
  return new Promise((res, rej) => { t2.oncomplete = res; t2.onerror = e => rej(e.target.error); });
}
