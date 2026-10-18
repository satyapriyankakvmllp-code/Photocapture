import { downloadBlob } from './folderStorage.js';

/** Downloads every captured photo as one ZIP (only runs when the user clicks). */
export async function downloadPhotosZip(photos, examId) {
  if (!photos.length) { alert('No photos captured yet.'); return; }
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  photos.forEach((p) => zip.file(p.fileName, p.blob));
  downloadBlob(await zip.generateAsync({ type: 'blob' }), `${examId || 'exam'}_photos.zip`);
}
