import * as faceapi from '@vladmandic/face-api';

let loading = null;
export function loadModels() {
  if (!loading) {
    loading = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    ]).then(async () => {
      // Warm-up run so the first real frame is fast (compiles GPU shaders once).
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      try { await detectFaces(c); } catch { /* ignore */ }
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** Faces with 68 landmark points (`pts`) in source pixel coordinates. */
export async function detectFaces(source) {
  const res = await faceapi
    .detectAllFaces(source, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true);
  return res.map((d) => ({
    x: d.detection.box.x, y: d.detection.box.y, width: d.detection.box.width, height: d.detection.box.height,
    score: d.detection.score, pts: d.landmarks.positions.map((p) => ({ x: p.x, y: p.y })),
  }));
}
