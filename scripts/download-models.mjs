// Downloads the Tiny Face Detector model into public/models (runs once; works offline afterwards).
import { mkdir, writeFile, access } from 'node:fs/promises';
const BASE = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';
const FILES = ['tiny_face_detector_model-weights_manifest.json', 'tiny_face_detector_model.bin',
  'face_landmark_68_tiny_model-weights_manifest.json', 'face_landmark_68_tiny_model.bin',
  'face_recognition_model-weights_manifest.json', 'face_recognition_model.bin'];
await mkdir('public/models', { recursive: true });
for (const f of FILES) {
  const p = `public/models/${f}`;
  try { await access(p); console.log('exists  ', f); continue; } catch {}
  try {
    const r = await fetch(BASE + f);
    if (!r.ok) throw new Error(r.status);
    await writeFile(p, Buffer.from(await r.arrayBuffer()));
    console.log('saved   ', f);
  } catch (e) {
    console.error(`FAILED ${f}: ${e.message}. Download it manually from ${BASE}${f} into public/models/`);
  }
}
