import { safeName } from './candidateUtils.js';

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder() {
  return window.showDirectoryPicker({ id: 'exam-photos', mode: 'readwrite' });
}
export async function ensurePermission(handle) {
  const o = { mode: 'readwrite' };
  if ((await handle.queryPermission(o)) === 'granted') return true;
  return (await handle.requestPermission(o)) === 'granted';
}
export const getExamDir = (root, examId, create = true) =>
  root.getDirectoryHandle(safeName(examId), { create });

export async function fileExists(dir, name) {
  try { await dir.getFileHandle(name); return true; }
  catch (e) { if (e.name === 'NotFoundError') return false; throw e; }
}
export async function writeFile(dir, name, blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try { await w.write(blob); await w.close(); }
  catch (e) { try { await w.abort(); } catch {} throw e; }
}
export async function readFile(dir, name) {
  return (await (await dir.getFileHandle(name)).getFile());
}
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** Zips every .jpg in the exam folder so it can be downloaded as one file. */
export async function zipExamFolder(root, examId) {
  const JSZip = (await import('jszip')).default;
  const dir = await getExamDir(root, examId, false);
  const zip = new JSZip();
  let count = 0;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file' && /\.jpe?g$/i.test(name)) { zip.file(name, await h.getFile()); count++; }
  }
  if (!count) throw new Error('No photos found in the exam folder yet.');
  return { blob: await zip.generateAsync({ type: 'blob' }), count };
}
