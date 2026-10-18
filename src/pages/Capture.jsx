import { useEffect, useRef, useState } from 'react';
import CameraPreview from '../components/CameraPreview.jsx';
import { CONFIG } from '../utils/config.js';
import { safeName } from '../utils/candidateUtils.js';
import { detectFaces, loadModels } from '../utils/faceDetection.js';
import { analyzeFrame, evaluateFrame } from '../utils/imageQuality.js';
import { downloadPhotosZip } from '../utils/zip.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GOOD = ['face', 'single', 'size', 'centered', 'pose', 'eyes'];

export default function Capture({ examId, candidates, photos, addPhoto, initialRoll, back }) {
  const videoRef = useRef(null);
  const tracker = useRef({});
  const busyRef = useRef(false);
  const photosRef = useRef(photos);
  const [q, setQ] = useState(initialRoll || '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [roll, setRoll] = useState(null);       // selected roll number (string)
  const [searchErr, setSearchErr] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [cam, setCam] = useState({ status: 'idle' });
  const [retryKey, setRetryKey] = useState(0);
  const [loopKey, setLoopKey] = useState(0);
  const [models, setModels] = useState('loading');
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(null);       // photo just captured
  const [popup, setPopup] = useState(null);
  const [snack, setSnack] = useState('');

  photosRef.current = photos;
  const cand = roll ? candidates.find((c) => c.roll === roll) : null;
  const existing = cand ? photos.find((p) => p.roll.toLowerCase() === cand.roll.toLowerCase()) : null;
  const matches = q.trim()
    ? candidates.filter((c) => c.roll.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  useEffect(() => { loadModels().then(() => setModels('ready')).catch(() => setModels('missing')); }, []);
  useEffect(() => { if (initialRoll) choose(initialRoll); /* eslint-disable-next-line */ }, [initialRoll]);

  const ok = result && GOOD.every((k) => result.checks[k].s === 'pass');
  const guide = cam.status === 'ready' && result ? (ok ? 'ok' : 'bad') : '';

  useEffect(() => {
    if (['denied', 'unavailable', 'disconnected', 'error'].includes(cam.status))
      setPopup({ title: 'Camera problem', text: `${cam.detail} Check the camera connection and the browser's camera permission.` });
  }, [cam.status]);

  function startCamera() { setLast(null); setResult(null); setSnack(''); setCamOn(true); setRetryKey((k) => k + 1); }

  /** Pick a roll number. New candidate -> camera opens automatically. Already captured -> show photo + Retake. */
  function choose(value) {
    setOpen(false); setLast(null); setResult(null); setSnack('');
    const c = candidates.find((x) => x.roll.toLowerCase() === String(value).trim().toLowerCase());
    if (!c) { setRoll(null); setCamOn(false); setSearchErr(String(value).trim() ? 'Roll number not found in the uploaded list.' : 'Enter a roll number.'); return; }
    setQ(c.roll); setRoll(c.roll); setSearchErr('');
    if (c.status === 'Success') setCamOn(false); else startCamera();
  }
  function onEnter() {
    const exact = candidates.find((c) => c.roll.toLowerCase() === q.trim().toLowerCase());
    choose(exact ? exact.roll : open && matches[hi] ? matches[hi].roll : q);
  }

  useEffect(() => {
    if (cam.status !== 'ready' || !cand || last || models !== 'ready') return;
    let stop = false;
    tracker.current = { last: null, stableSince: performance.now(), consec: 0 };
    (async () => {
      while (!stop) {
        const t0 = performance.now(), v = videoRef.current;
        if (v?.videoWidth && !busyRef.current) {
          try {
            const r = evaluateFrame({ vw: v.videoWidth, vh: v.videoHeight, faces: await detectFaces(v), quality: analyzeFrame(v), tracker: tracker.current });
            if (stop) break;
            setResult(r); setSnack(r.hint);
            if (r.ready) { stop = true; capture(false); } // auto capture
          } catch (e) { console.error(e); }
        }
        await sleep(Math.max(20, CONFIG.detectIntervalMs - (performance.now() - t0)));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line
  }, [cam.status, cand?.roll, last, models, loopKey]);

  /** manual=true: only needs one face in frame (fallback when auto capture is not triggering). */
  async function capture(manual) {
    const v = videoRef.current;
    if (!v || busyRef.current || !cand) return;
    busyRef.current = true;
    try {
      const cv = document.createElement('canvas');
      cv.width = v.videoWidth; cv.height = v.videoHeight;
      cv.getContext('2d').drawImage(v, 0, 0);
      const r = evaluateFrame({ vw: cv.width, vh: cv.height, faces: await detectFaces(cv), quality: analyzeFrame(cv), skipStability: true });
      const pass = manual ? r.checks.single.s === 'pass' && r.checks.resolution.s === 'pass' : r.ready;
      if (!pass) {
        setSnack(manual ? r.checks.single.label : r.hint);
        if (!manual) setLoopKey((k) => k + 1);
        busyRef.current = false; return;
      }
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', CONFIG.jpegQuality));
      save(blob);
    } catch (e) { setPopup({ title: 'Capture failed', text: `${e.message} Press Capture to try again.` }); }
    busyRef.current = false;
  }

  /** Stores ROLL.jpg in the in-app folder (a retake becomes ROLL_photo1.jpg, ...). Nothing is downloaded automatically. */
  function save(blob) {
    const base = safeName(cand.roll);
    const taken = new Set(photosRef.current.map((p) => p.fileName));
    let fileName = `${base}.jpg`;
    for (let n = 1; taken.has(fileName); n++) fileName = `${base}_photo${n}.jpg`;
    const photo = { roll: cand.roll, fileName, blob, url: URL.createObjectURL(blob), time: new Date().toLocaleTimeString() };
    addPhoto(photo); setLast(photo); setCamOn(false); setSnack('');
  }

  const next = candidates.find((c) => c.status !== 'Success' && c.roll !== cand?.roll);
  const showCamera = cand && !last && camOn;
  const pm = result?.metrics?.pose;

  return (
    <div className="card wide">
      <div className="row between">
        <h1>Capture photo</h1>
        <button className="btn sm" disabled={!photos.length} onClick={() => downloadPhotosZip(photos, examId)}>📦 Download ZIP ({photos.length})</button>
      </div>

      <div className="row">
        <div className="combo">
          <input value={q} placeholder="Type roll number" autoComplete="off"
            onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnter();
              else if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, matches.length - 1)); e.preventDefault(); }
              else if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
              else if (e.key === 'Escape') setOpen(false);
            }} />
          {open && matches.length > 0 && (
            <ul className="sugg" role="listbox">
              {matches.map((c, i) => (
                <li key={c.roll} className={i === hi ? 'on' : ''} role="option" onMouseDown={() => choose(c.roll)}>
                  <b>{c.roll}</b><small>{c.status === 'Success' ? '✓ Captured' : 'Pending'}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn primary" onClick={onEnter}>Search</button>
      </div>
      {searchErr && <div className="alert err">{searchErr}</div>}
      {models === 'missing' && <div className="alert err">Face model files missing in public/models. Run <code>npm run setup-models</code>.</div>}

      {cand && (
        <div className="cand">
          <div><span className="muted">Roll Number</span><div className="big">{cand.roll}</div></div>
          <div><span className="muted">Status</span><div className="big" style={{ marginTop: 4 }}>
            {cand.status === 'Success' ? <span className="badge badge-success">✓ Success</span> : <span className="badge badge-pending">Pending</span>}</div></div>
        </div>
      )}

      {/* Already captured: show the photo with Retake */}
      {cand && existing && !camOn && !last && (
        <div className="existing">
          <img src={existing.url} alt={existing.fileName} />
          <div>
            <div className="muted">Saved as <code>{existing.fileName}</code></div>
            <div className="row">
              <button className="btn primary" onClick={startCamera}>Retake</button>
              {next && <button className="btn" onClick={() => choose(next.roll)}>Next candidate ({next.roll})</button>}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>A retake is saved as an extra file; the earlier photo stays in the ZIP.</div>
          </div>
        </div>
      )}

      {showCamera && (
        <>
          <CameraPreview videoRef={videoRef} enabled={camOn} retryKey={retryKey} guide={guide}
            onStatus={setCam} onStart={startCamera} />
          <div className="row">
            <button className="btn primary bigbtn" style={{ flex: 1, margin: 0 }} disabled={cam.status !== 'ready' || models !== 'ready'} onClick={() => capture(true)}>
              Capture
            </button>
            <button className="btn" onClick={startCamera} title="Restart the camera">Retake / Restart camera</button>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>Auto capture runs when your face is straight and still. If it doesn't, press Capture.</p>
          {pm && <p className="tune">Pose check — facing: {pm.yaw} (0.6–1.67), head tilt: {pm.pitch} (0.40–0.66), eyes: {pm.eyes} (≥0.17)</p>}
          {cam.status === 'ready' && models === 'loading' && <p className="muted">Loading face detection…</p>}
        </>
      )}

      {last && (
        <div className="alert ok" style={{ padding: 16 }}>
          <b>✓ Photo captured and saved in the folder as {last.fileName}</b>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '12px 0' }}>
            <img src={last.url} alt={last.roll} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ok)' }} />
            <div className="muted">Roll Number: <b>{last.roll}</b><br />Use <b>Download ZIP</b> to get all photos on your computer.</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={startCamera}>Retake</button>
            {next && <button className="btn" onClick={() => choose(next.roll)}>Next candidate ({next.roll})</button>}
            <button className="btn" onClick={() => { setRoll(null); setQ(''); setLast(null); }}>Search another roll number</button>
          </div>
        </div>
      )}

      {snack && cam.status === 'ready' && !last && showCamera && <div className={`snack ${ok ? 'ok' : 'bad'}`} role="status">{snack}</div>}

      {popup && (
        <div className="modal"><div className="card narrow">
          <h2>{popup.title}</h2><p>{popup.text}</p>
          <div className="row">
            <button className="btn primary" onClick={() => { setPopup(null); startCamera(); }}>Retry camera</button>
            <button className="btn" onClick={() => setPopup(null)}>Close</button>
          </div>
        </div></div>
      )}
    </div>
  );
}
