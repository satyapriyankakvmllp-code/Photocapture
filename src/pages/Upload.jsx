import { useState } from 'react';
import { parseExcel } from '../utils/excelUtils.js';
import { makeCandidates } from '../utils/candidateUtils.js';
import { downloadPhotosZip } from '../utils/zip.js';

export default function Upload({ examId, loading, storageErr, count, fileName, skipped, photos, onLoad, onClear, startCapture }) {
  const [err, setErr] = useState('');
  const warn = 'You already captured photos for the current list. Replacing or removing the list will clear them. Download the ZIP first if you need them. Continue?';

  const onFile = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    try {
      const r = await parseExcel(f);
      if (photos.length && !window.confirm(warn)) return;
      onLoad(makeCandidates(r.rows), f.name, r.summary.invalid);
    } catch (x) { setErr(x.message); }
  };
  const remove = () => {
    if (photos.length ? window.confirm(warn) : window.confirm('Remove this Excel file?')) onClear();
  };

  if (loading) return <div className="card narrow" style={{ alignItems: 'center' }}><div className="spinner dark" /><p>Loading saved data…</p></div>;
  return (
    <div className="card">
      <h1>Upload candidate list</h1>
      {storageErr && <div className="alert err">{storageErr}</div>}
      <p className="muted">Excel needs only a <b>Roll Number</b> column.</p>
      {err && <div className="alert err">{err}</div>}

      {count === 0 ? (
        <label className="btn primary">Upload Excel (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" hidden onChange={onFile} /></label>
      ) : (
        <div className="filechip">
          <div>
            <div>📄 <b>{fileName}</b></div>
            <div className="big">{count} candidates</div>
            {skipped > 0 && <div className="muted">{skipped} duplicate roll numbers skipped</div>}
          </div>
          <button className="xbtn" onClick={remove} aria-label="Remove file" title="Remove this file and upload another">✕</button>
        </div>
      )}

      <div className="row between" style={{ marginTop: 20 }}>
        {photos.length > 0 ? <button className="btn sm" onClick={() => downloadPhotosZip(photos, examId)}>📦 Download ZIP ({photos.length})</button> : <span />}
        <button className="btn primary" disabled={!count} onClick={() => startCapture()}>
          {photos.length ? 'Continue Capturing' : 'Start Capturing'}
        </button>
      </div>
    </div>
  );
}
