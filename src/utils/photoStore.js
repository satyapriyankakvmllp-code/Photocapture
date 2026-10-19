// Photo persistence. One API for both runtimes:
//   - Browser / Netlify : IndexedDB (survives refresh and closing the tab; private to this browser profile)
//   - Desktop (Electron): ALSO writes <app folder>/ExamPhotos/<EXAMID>/<ROLL>.jpg through the secure preload bridge
// Photo bytes are never kept in localStorage; localStorage only holds the roll-number list.
import { safeName } from './candidateUtils.js';

const DB = 'exam-photo-capture', STORE = 'photos';
export const desktop = () => (typeof window !== 'undefined' ? window.desktop : undefined);

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support persistent storage (IndexedDB).'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'key' });
      s.createIndex('examId', 'examId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open browser storage.'));
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const keyOf = (examId, roll) => `${examId}::${String(roll).toLowerCase()}`;

/** Ask the browser not to evict our data under storage pressure (best effort). */
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => false);

/** Save one photo (replaces any earlier photo of the same roll number). Throws if it could not be stored. */
export async function savePhoto(examId, photo) {
  const data = await photo.blob.arrayBuffer();
  const d = desktop();
  if (d) await d.savePhoto(examId, photo.roll, data); // real file on disk first; throws on failure
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key: keyOf(examId, photo.roll), examId, roll: photo.roll, fileName: photo.fileName, type: 'image/jpeg', data, time: photo.time, descriptor: photo.descriptor || null });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  } catch (e) {
    if (!d) throw e; // on the web IndexedDB is the only copy, so this must not fail silently
  }
}

const toPhoto = (r) => ({
  roll: r.roll, fileName: r.fileName, time: r.time, descriptor: r.descriptor || null,
  blob: new Blob([r.data], { type: r.type || 'image/jpeg' }),
});

/** Load every saved photo of an exam (IndexedDB, plus files on disk on desktop). Newest first. */
export async function loadPhotos(examId) {
  const byName = new Map();
  try {
    const db = await openDB();
    const rows = await wrap(db.transaction(STORE).objectStore(STORE).index('examId').getAll(examId));
    rows.forEach((r) => byName.set(r.fileName, toPhoto(r)));
  } catch (e) { if (!desktop()) throw e; }
  const d = desktop();
  if (d) {
    for (const f of await d.readAll(examId)) {
      if (!byName.has(f.fileName)) {
        const roll = f.fileName.replace(/\.jpe?g$/i, '');
        byName.set(f.fileName, { roll, fileName: f.fileName, time: '', blob: new Blob([f.data], { type: 'image/jpeg' }) });
      }
    }
  }
  return [...byName.values()].map((p) => ({ ...p, url: URL.createObjectURL(p.blob) }))
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));
}

/** Removes the browser copy of an exam's photos (files already written on desktop are never deleted automatically). */
export async function clearExamPhotos(examId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const idx = tx.objectStore(STORE).index('examId');
  const keys = await wrap(idx.getAllKeys(examId));
  keys.forEach((k) => tx.objectStore(STORE).delete(k));
  await new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
}

export { safeName };
