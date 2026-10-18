import { useState } from 'react';
import { downloadPhotosZip } from '../utils/zip.js';

/** Roll number page: type, pick from the list or press Search/Enter -> the camera opens. Captured candidates show their photo + Retake. */
export default function Select({ examId, candidates, photos, info, openCamera }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [roll, setRoll] = useState('');       // captured candidate being reviewed
  const [err, setErr] = useState('');
  const [opening, setOpening] = useState(false);
  const [zoom, setZoom] = useState(false);

  const term = q.trim().toLowerCase();
  const matches = term ? candidates.filter((c) => c.roll.toLowerCase().includes(term)).slice(0, 8) : [];
  const existing = roll ? photos.find((p) => p.roll.toLowerCase() === roll.toLowerCase()) : null;

  const launch = (r) => { if (opening) return; setOpening(true); openCamera(r); };
  /** Search a roll number: new candidate -> camera opens; already captured -> show the photo with Retake. */
  const submit = (value) => {
    const cand = candidates.find((c) => c.roll.toLowerCase() === String(value).trim().toLowerCase());
    setOpen(false); setRoll('');
    if (!cand) { setErr(String(value).trim() ? `Roll number "${String(value).trim()}" is not in the uploaded list.` : 'Enter a roll number.'); return; }
    setErr(''); setQ(cand.roll);
    if (photos.some((p) => p.roll.toLowerCase() === cand.roll.toLowerCase())) setRoll(cand.roll);
    else launch(cand.roll);
  };
  const onSearch = () => {
    if (opening) return;
    const exact = candidates.find((c) => c.roll.toLowerCase() === term);
    submit(exact ? exact.roll : open && matches[hi] ? matches[hi].roll : q);
  };
  const clear = () => { setQ(''); setRoll(''); setErr(''); setOpen(false); setOpening(false); };

  return (
    <div className="card wide">
      <div className="row between">
        <h1>Select candidate</h1>
        <button className="btn sm" disabled={!photos.length} onClick={() => downloadPhotosZip(photos, examId)}>📦 Download ZIP ({photos.length})</button>
      </div>

      <div className="row">
        <div className="combo">
          <input value={q} placeholder="Enter roll number" autoComplete="off" aria-label="Roll number" disabled={opening}
            onChange={(e) => { setQ(e.target.value); setRoll(''); setErr(''); setOpen(true); setHi(0); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
              else if (e.key === 'ArrowDown') { setHi((h) => Math.min(h + 1, matches.length - 1)); e.preventDefault(); }
              else if (e.key === 'ArrowUp') { setHi((h) => Math.max(h - 1, 0)); e.preventDefault(); }
              else if (e.key === 'Escape') setOpen(false);
            }} />
          {open && term && !opening && (
            <ul className="sugg" role="listbox">
              {matches.length === 0
                ? <li className="none">No matching roll numbers</li>
                : matches.map((c, i) => (
                  <li key={c.roll} className={i === hi ? 'on' : ''} role="option" onMouseDown={() => submit(c.roll)}>
                    <b>{c.roll}</b><small>{c.status === 'Success' ? '✓ Captured' : 'Pending'}</small>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <button className="btn primary" disabled={opening} onClick={onSearch}>
          {opening ? <><span className="mini-spin" /> Opening camera…</> : 'Search'}
        </button>
        <button className="btn" onClick={clear}>Clear</button>
      </div>
      {err && <div className="alert err">{err}</div>}

      {roll && existing && (
        <div className="selected">
          <div className="cand" style={{ margin: 0 }}>
            <div><span className="muted">Roll Number</span><div className="big">{roll}</div></div>
            <div><span className="muted">Status</span><div className="big" style={{ marginTop: 4 }}><span className="badge badge-success">✓ Captured</span></div></div>
          </div>
          <div className="existing">
            <img src={existing.url} alt={existing.fileName} onClick={() => setZoom(true)} title="Click to review" style={{ cursor: 'zoom-in' }} />
            <div className="muted">Saved as <code>{existing.fileName}</code><br />Tap the photo to review it. If it is not clear, retake it — the new photo replaces this one.</div>
          </div>
          <div className="row">
            <button className="btn primary" disabled={opening} onClick={() => launch(roll)}>
              {opening ? <><span className="mini-spin" /> Opening camera…</> : 'Retake'}
            </button>
          </div>
        </div>
      )}

      {!roll && !err && <p className="muted">Type a roll number and press Search (or Enter). The camera opens for that candidate.</p>}

      <p className="muted storage">
        {info
          ? <>💾 Photos are saved to <code>{info.dir}</code> as <code>{examId}/ROLLNUMBER.jpg</code>. <button className="linkbtn" onClick={() => window.desktop.openFolder(examId)}>Open folder</button></>
          : <>💾 Photos are stored in this browser and survive a refresh. Use <b>Download ZIP</b> to keep a copy on your computer.</>}
      </p>

      {zoom && existing && (
        <div className="modal" onClick={() => setZoom(false)}>
          <div className="card" style={{ maxWidth: 520, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h2>{existing.fileName}</h2>
            <img src={existing.url} alt={existing.fileName} style={{ width: '100%', borderRadius: 8 }} />
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" disabled={opening} onClick={() => launch(roll)}>Retake</button>
              <button className="btn" onClick={() => setZoom(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
