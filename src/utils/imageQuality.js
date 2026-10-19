import { CONFIG } from './config.js';

const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });

/** Brightness (mean luma) and sharpness (variance of Laplacian) from a downscaled copy. */
export function analyzeFrame(source) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  const w = 320, h = Math.max(1, Math.round((sh / sw) * w));
  work.width = w; work.height = h;
  wctx.drawImage(source, 0, 0, w, h);
  const px = wctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    g[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    sum += g[j];
  }
  const brightness = sum / g.length;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      s += l; s2 += l * l; n++;
    }
  const sharpness = s2 / n - (s / n) ** 2;
  return { brightness, sharpness };
}


const mean = (pts, idx) => ({ x: idx.reduce((a, i) => a + pts[i].x, 0) / idx.length, y: idx.reduce((a, i) => a + pts[i].y, 0) / idx.length });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ear = (p, i) => (dist(p[i + 1], p[i + 5]) + dist(p[i + 2], p[i + 4])) / (2 * dist(p[i], p[i + 3]));

/** Head pose + eye openness from the 68 landmarks. */
export function poseOf(pts) {
  const le = mean(pts, [36, 37, 38, 39, 40, 41]), re = mean(pts, [42, 43, 44, 45, 46, 47]);
  const eyeMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const mouth = mean(pts, [60, 61, 62, 63, 64, 65, 66, 67]);
  const nose = pts[30];
  return {
    roll: Math.abs((Math.atan2(re.y - le.y, re.x - le.x) * 180) / Math.PI),
    yaw: (nose.x - pts[0].x) / Math.max(1, pts[16].x - nose.x),
    pitch: (nose.y - eyeMid.y) / Math.max(1, mouth.y - eyeMid.y),
    eyes: Math.min(ear(pts, 36), ear(pts, 42)),
  };
}

const gc = document.createElement('canvas');
const gctx = gc.getContext('2d', { willReadFrequently: true });
/**
 * Rough gaze estimate: where the dark pupil/iris sits between the two eye corners (0..1, 0.5 = looking straight).
 * Averages both eyes. Returns null if it cannot be measured. It is a heuristic, not eye tracking.
 */
export function gazeOf(source, pts) {
  const eye = (i) => {
    const xs = [], ys = [];
    for (let k = 0; k < 6; k++) { xs.push(pts[i + k].x); ys.push(pts[i + k].y); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 - x0 < 8 || y1 - y0 < 3) return null;
    const W = 40, H = 16;
    gc.width = W; gc.height = H;
    gctx.drawImage(source, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H);
    const d = gctx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    let mean = 0;
    for (let j = 0; j < W * H; j++) { g[j] = 0.299 * d[j * 4] + 0.587 * d[j * 4 + 1] + 0.114 * d[j * 4 + 2]; mean += g[j]; }
    mean /= W * H;
    let sw = 0, sx = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 0; x < W; x++) { // skip lid rows
      const w = Math.max(0, mean - g[y * W + x]) ** 2;
      sw += w; sx += w * x;
    }
    return sw > 0 ? sx / sw / (W - 1) : null;
  };
  const a = eye(36), b = eye(42);
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

const P = 'pass', W = 'warn', F = 'fail';

/**
 * Turns detections + metrics into a checklist. `tracker` holds movement state between frames
 * (omit it with skipStability for the final check on a captured still).
 */
export function evaluateFrame({ vw, vh, faces, gaze = null, quality, tracker, now = performance.now(), skipStability = false }) {
  const c = {};
  c.camera = { s: P, label: 'Camera active' };
  c.face = faces.length ? { s: P, label: 'Face found' } : { s: F, label: 'No face detected. Please face the camera.' };
  c.single = faces.length === 1 ? { s: P, label: 'One face' }
    : faces.length === 0 ? { s: F, label: 'No face' }
    : { s: F, label: 'Multiple faces detected. Only one person should be in the frame.' };

  const b = faces.length === 1 ? faces[0] : null;
  if (b) {
    const ratio = b.height / vh;
    c.size = ratio >= CONFIG.minFaceHeightRatio ? { s: P, label: `Size OK (${Math.round(ratio * 100)}%)` }
      : { s: F, label: 'Move closer to the camera.' };
    const cx = (b.x + b.width / 2) / vw, cy = (b.y + b.height / 2) / vh;
    const inEdge = b.x > CONFIG.edgeMargin * vw && b.y > CONFIG.edgeMargin * vh &&
      b.x + b.width < (1 - CONFIG.edgeMargin) * vw && b.y + b.height < (1 - CONFIG.edgeMargin) * vh;
    const centered = Math.abs(cx - 0.5) <= CONFIG.centerTolX && Math.abs(cy - 0.5) <= CONFIG.centerTolY;
    c.centered = centered && inEdge ? { s: P, label: 'Centered' } : { s: F, label: 'Please position your face in the center.' };
  } else {
    c.size = { s: F, label: 'No face' };
    c.centered = { s: F, label: 'No face' };
  }

  let pose = null;
  if (b && b.pts) {
    pose = poseOf(b.pts);
    if (pose.pitch > CONFIG.pitchMax) c.pose = { s: F, label: 'Please look straight at the camera.' };
    else if (pose.pitch < CONFIG.pitchMin) c.pose = { s: F, label: 'Please look straight at the camera.' };
    else if (pose.yaw < CONFIG.yawMin || pose.yaw > CONFIG.yawMax) c.pose = { s: F, label: 'Please look straight at the camera.' };
    else if (pose.roll > CONFIG.maxRollDeg) c.pose = { s: F, label: 'Please look straight at the camera.' };
    else c.pose = { s: P, label: 'Facing camera' };
    c.eyes = pose.eyes >= CONFIG.minEyeOpen ? { s: P, label: 'Eyes open' } : { s: F, label: 'Please look straight at the camera.' };
    c.gaze = gaze == null || !CONFIG.gazeCheck ? { s: P, label: 'n/a' }
      : Math.abs(gaze - 0.5) <= CONFIG.gazeTolerance ? { s: P, label: 'Looking at camera' }
      : { s: F, label: 'Please look straight at the camera.' };
  } else {
    c.gaze = { s: F, label: 'No face' };
    c.pose = { s: F, label: 'No face' };
    c.eyes = { s: F, label: 'No face' };
  }

  const br = quality.brightness;
  c.light = br < CONFIG.brightnessMin ? { s: F, label: 'Too Dark' }
    : br > CONFIG.brightnessMax ? { s: F, label: 'Too Bright' } : { s: P, label: 'Good Lighting' };
  const sh = quality.sharpness;
  c.sharp = sh < CONFIG.sharpnessMin ? { s: F, label: 'Image looks blurry. Hold still / clean the lens.' }
    : sh < CONFIG.sharpnessMin * 1.3 ? { s: W, label: 'Borderline sharpness' } : { s: P, label: 'Sharp enough' };
  const resOk = Math.max(vw, vh) >= CONFIG.minWidth && Math.min(vw, vh) >= CONFIG.minHeight; // works in portrait on phones too
  c.resolution = resOk ? { s: P, label: `${vw}×${vh}` }
    : { s: F, label: `${vw}×${vh} is below ${CONFIG.minWidth}×${CONFIG.minHeight}` };

  if (skipStability) c.stable = { s: P, label: 'n/a for still' };
  else if (!b) { if (tracker) { tracker.last = null; tracker.consec = 0; tracker.stableSince = now; } c.stable = { s: F, label: 'No single face' }; }
  else {
    const last = tracker.last;
    if (last) {
      const mv = Math.max(Math.abs(b.x + b.width / 2 - (last.x + last.width / 2)),
        Math.abs(b.y + b.height / 2 - (last.y + last.height / 2)), Math.abs(b.width - last.width)) / vw;
      if (mv > CONFIG.moveTolerance) tracker.stableSince = now;
    } else tracker.stableSince = now;
    tracker.last = b; tracker.consec++;
    const held = now - tracker.stableSince;
    c.stable = tracker.consec >= CONFIG.consistentFrames && held >= CONFIG.stableMs
      ? { s: P, label: 'Stable' } : { s: W, label: 'Hold still…' };
  }

  const order = ['face', 'single', 'size', 'centered', 'pose', 'eyes', 'gaze', 'light', 'sharp', 'resolution', 'stable'];
  const bad = order.find((k) => c[k].s !== P);
  return { checks: c, ready: !bad, hint: bad ? c[bad].label : 'All checks passed. You can capture.',
    metrics: { brightness: Math.round(br), sharpness: Math.round(sh), pose: pose && { yaw: +pose.yaw.toFixed(2), pitch: +pose.pitch.toFixed(2), eyes: +pose.eyes.toFixed(2) } } };
}
