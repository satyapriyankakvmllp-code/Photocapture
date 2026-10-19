import { useEffect, useRef, useState } from 'react';
import CameraPreview from '../components/CameraPreview.jsx';
import { CONFIG } from '../utils/config.js';
import { safeName } from '../utils/candidateUtils.js';
import { describeFace, detectFaces, faceDistance, loadModels } from '../utils/faceDetection.js';
import { analyzeFrame, evaluateFrame, gazeOf } from '../utils/imageQuality.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GOOD = ['face', 'single', 'size', 'centered', 'pose', 'eyes', 'gaze'];
/** On phones the preview and the saved photo are a centred SQUARE, so what you see is what is checked and saved. */
const sqCanvas = document.createElement('canvas');
function frameOf(v, square) {
  if (!square) return v;
  const side = Math.min(v.videoWidth, v.videoHeight);
  sqCanvas.width = sqCanvas.height = side;
  sqCanvas.getContext('2d').drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
  return sqCanvas;
}
const dimsOf = (s) => ({ w: s.videoWidth || s.width, h: s.videoHeight || s.height });
const lookFaces = async (src) => { const faces = await detectFaces(src); return { faces, gaze: faces.length === 1 ? gazeOf(src, faces[0].pts) : null }; };

/** Separate camera page for ONE candidate. All state lives here, so leaving the page resets everything. */
export default function Camera({ roll, candidates, photos, addPhoto, back, nextCandidate }) {
  const videoRef = useRef(null);
  const tracker = useRef({});
  const busyRef = useRef(false);   // blocks double capture / double save
  const [cam, setCam] = useState({ status: 'idle' });
  const [retryKey, setRetryKey] = useState(0);
  const [loopKey, setLoopKey] = useState(0);
  const [camOn, setCamOn] = useState(true);
  const [models, setModels] = useState('loading');
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(null);     // photo captured in this session
  const [saving, setSaving] = useState(false);
  const [popup, setPopup] = useState(null);
  const [snack, setSnack] = useState('');
  const [dupMsg, setDupMsg] = useState('');   // "already exists with roll number …"
  const pausedRef = useRef(false);            // auto capture paused after a duplicate until the person leaves
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [facing, setFacing] = useState('user');   // front camera by default
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState([]);
  const [camName, setCamName] = useState('');
  const activeId = useRef('');
  const coarse = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); // phone / tablet only

  const cand = candidates.find((c) => c.roll === roll);
  const previous = photos.find((p) => p.roll.toLowerCase() === roll.toLowerCase());

  useEffect(() => { loadModels().then(() => setModels('ready')).catch(() => setModels('missing')); }, []);
  useEffect(() => () => { setSnack(''); }, []);

  const ok = result && GOOD.every((k) => result.checks[k].s === 'pass');
  const guide = cam.status === 'ready' && result ? (ok ? 'ok' : 'bad') : '';

  useEffect(() => {
    if (['denied', 'unavailable', 'disconnected', 'error'].includes(cam.status))
      setPopup({ title: 'Camera problem', text: `${cam.detail} Check the camera connection and the browser's camera permission.` });
  }, [cam.status]);

  /** Phones only: toggle front <-> rear camera. (Desktop uses the default webcam and has no switch option.) */
  function switchCamera() {
    if (saving) return;
    setResult(null); setSnack('');
    setDeviceId(''); setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  }
  function startCamera() { if (saving) return; setLast(null); setResult(null); setSnack(''); setCamOn(true); setRetryKey((k) => k + 1); }

  useEffect(() => {
    if (cam.status !== 'ready' || !cand || last || saving || models !== 'ready') return;
    let stop = false;
    tracker.current = { last: null, stableSince: performance.now(), consec: 0 };
    (async () => {
      while (!stop) {
        const t0 = performance.now(), v = videoRef.current;
        if (v?.videoWidth && !busyRef.current) {
          try {
            const src = frameOf(v, coarse), d = dimsOf(src);
            const r = evaluateFrame({ vw: d.w, vh: d.h, ...(await lookFaces(src)), quality: analyzeFrame(src), tracker: tracker.current });
            if (stop) break;
            setResult(r); setSnack(r.ready ? '' : r.hint);
            if (r.checks.single.s !== 'pass') { pausedRef.current = false; setDupMsg(''); } // person left: re-arm
            if (r.ready && !pausedRef.current) { stop = true; capture(false); } // auto capture
          } catch (e) { console.error(e); }
        }
        await sleep(Math.max(20, CONFIG.detectIntervalMs - (performance.now() - t0)));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line
  }, [cam.status, cand?.roll, last, saving, models, loopKey]);

  /** manual=true: needs one face in frame plus a straight look (face-direction check always applies). */
  async function capture(manual) {
    const v = videoRef.current;
    if (!v || busyRef.current || !cand) return;
    busyRef.current = true;
    try {
      const cv = document.createElement('canvas');
      const side = Math.min(v.videoWidth, v.videoHeight);
      if (coarse) { cv.width = cv.height = side; cv.getContext('2d').drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side); }
      else { cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d').drawImage(v, 0, 0); }
      const r = evaluateFrame({ vw: cv.width, vh: cv.height, ...(await lookFaces(cv)), quality: analyzeFrame(cv), skipStability: true });
      // Auto capture needs the full look-at-camera check. Manual capture only needs one face in frame.
      const MANUAL = ['face', 'single', 'resolution'];
      const pass = manual ? MANUAL.every((k) => r.checks[k].s === 'pass') : r.ready;
      if (!pass) {
        const bad = manual ? MANUAL.find((k) => r.checks[k].s !== 'pass') : null;
        setSnack(manual ? r.checks[bad].label : r.hint);
        if (!manual) setLoopKey((k) => k + 1);
        busyRef.current = false; return;
      }
      // Is this the same person as a photo already saved under ANOTHER roll number?
      let descriptor = null;
      if (CONFIG.duplicateFaceCheck) {
        try { descriptor = await describeFace(cv); } catch { descriptor = null; }
        if (descriptor) {
          let best = null;
          for (const p of photosRef.current) {
            if (!p.descriptor || p.roll.toLowerCase() === cand.roll.toLowerCase()) continue;
            const d = faceDistance(descriptor, p.descriptor);
            if (!best || d < best.d) best = { d, roll: p.roll };
          }
          if (best && best.d < CONFIG.duplicateFaceDistance) {
            pausedRef.current = true;
            setDupMsg(`This person already exists with roll number ${best.roll}.`);
            setSnack(''); setLoopKey((k) => k + 1);
            busyRef.current = false; return;
          }
        }
      }
      setSaving(true);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', CONFIG.jpegQuality));
      await sleep(120); // lets the "Saving photo…" feedback render
      await save(blob, descriptor);
    } catch (e) { setPopup({ title: 'Capture failed', text: `${e.message} Press Capture to try again.` }); }
    setSaving(false);
    busyRef.current = false;
  }

  /** Always ROLL.jpg. Persisted (IndexedDB / disk) BEFORE it is shown as saved; a retake replaces the earlier photo. */
  async function save(blob, descriptor = null) {
    const fileName = `${safeName(cand.roll)}.jpg`;
    const photo = { roll: cand.roll, fileName, blob, descriptor, url: URL.createObjectURL(blob), time: new Date().toISOString() };
    try {
      await addPhoto(photo);
      setLast(photo); setCamOn(false); setSnack('');
    } catch (e) {
      URL.revokeObjectURL(photo.url);
      setPopup({ title: 'Saving failed', text: `The photo could not be saved: ${e.message}`, blob });
    }
  }
  async function saveAgain(blob) {
    setPopup(null); busyRef.current = true; setSaving(true);
    await save(blob);
    setSaving(false); busyRef.current = false;
  }

  if (!cand) {
    return (
      <div className="card narrow">
        <h2>Invalid roll number</h2><p>This roll number is not in the uploaded list.</p>
        <button className="btn primary" onClick={back}>Back to selection</button>
      </div>
    );
  }

  return (
    <div className="card wide">
      <div className="row between">
        <div><h1 style={{ margin: 0 }}>Camera</h1><span className="muted">Roll Number</span> <span className="big">{cand.roll}</span></div>
        <button className="btn sm" onClick={back} disabled={saving}>Back to selection</button>
      </div>
      {models === 'missing' && <div className="alert err">Face model files missing in public/models. Run <code>npm run setup-models</code>.</div>}

      {!last && (
        <>
          {previous && <div className="alert warn">Retaking: the earlier photo <code>{previous.fileName}</code> will be replaced when the new photo is saved.</div>}
          <div className="camwrap">
            <CameraPreview videoRef={videoRef} enabled={camOn} retryKey={retryKey} guide={guide} facingMode={facing} deviceId={deviceId} square={coarse}
              onStatus={setCam} onStart={startCamera}
              onDevices={(devs, id, fm) => {
                setDevices(devs); activeId.current = id;
                const d = devs.find((x) => x.deviceId === id);
                setCamName(fm === 'environment' ? 'Rear camera' : fm === 'user' && coarse ? 'Front camera' : d?.label || 'Camera');
              }} />
            {saving && <div className="overlay savingov"><div className="spinner" /><p>Saving photo…</p></div>}
          </div>
          <div className="row">
            <button className="btn primary bigbtn" style={{ flex: 1, margin: 0 }} disabled={cam.status !== 'ready' || models !== 'ready' || saving} onClick={() => capture(true)}>
              {saving ? 'Saving…' : 'Capture'}
            </button>
            <button className="btn" onClick={startCamera} disabled={saving}>Restart camera</button>
            {coarse && devices.length > 1 && <button className="btn" onClick={switchCamera} disabled={saving || cam.status === 'loading'}>🔄 Switch camera</button>}
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>{camName && <b>{camName}. </b>}Look at the camera: the photo is taken automatically. If it doesn't, press Capture.</p>
          {cam.status === 'ready' && models === 'loading' && <p className="muted">Loading face detection…</p>}
        </>
      )}

      {last && (
        <div className="alert ok" style={{ padding: 16 }}>
          <b>✓ Photo captured and saved as {last.fileName}</b>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
            <img src={last.url} alt={last.roll} style={{ width: 160, height: coarse ? 160 : 120, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ok)' }} />
            <div className="muted">Roll Number: <b>{last.roll}</b><br />Not clear? Press Retake.</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={nextCandidate}>Next Candidate</button>
            <button className="btn" onClick={startCamera}>Retake</button>
          </div>
        </div>
      )}

      {dupMsg && cam.status === 'ready' && !last && <div className="snack bad dup" role="alert">{dupMsg}</div>}
      {snack && !dupMsg && cam.status === 'ready' && !last && <div className="snack bad" role="status">{snack}</div>}

      {popup && (
        <div className="modal"><div className="card narrow">
          <h2>{popup.title}</h2><p>{popup.text}</p>
          <div className="row">
            {popup.blob
              ? <button className="btn primary" onClick={() => saveAgain(popup.blob)}>Save again</button>
              : <button className="btn primary" onClick={() => { setPopup(null); startCamera(); }}>Retry camera</button>}
            <button className="btn" onClick={back}>Back to selection</button>
          </div>
        </div></div>
      )}
    </div>
  );
}
