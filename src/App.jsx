import { useEffect, useMemo, useRef, useState } from 'react';
import Login from './pages/Login.jsx';
import Upload from './pages/Upload.jsx';
import Select from './pages/Select.jsx';
import Camera from './pages/Camera.jsx';
import { loadModels } from './utils/faceDetection.js';
import { clearExamPhotos, desktop, loadPhotos, requestPersistence, savePhoto } from './utils/photoStore.js';

const listKey = (id) => `examCapture.list.${id}`;
const readList = (id) => { try { return JSON.parse(localStorage.getItem(listKey(id))) || { rolls: [], fileName: '', skipped: 0 }; } catch { return { rolls: [], fileName: '', skipped: 0 }; } };

export default function App() {
  const [step, setStep] = useState('login');
  const [examId, setExamId] = useState(() => localStorage.getItem('examCapture.lastExam') || '');
  const [activeExam, setActiveExam] = useState(''); // exam whose data is loaded
  const [loading, setLoading] = useState(false);
  const [storageErr, setStorageErr] = useState('');
  const [info, setInfo] = useState(null);          // desktop app info (folder path), null on the web
  const loadedFor = useRef('');
  const [list, setList] = useState({ rolls: [], fileName: '', skipped: 0 }); // from Excel
  const [photos, setPhotos] = useState([]);   // captured photos kept in memory ("folder"), newest first
  const [selectedRoll, setSelectedRoll] = useState('');

  const candidates = useMemo(() => {
    const done = new Set(photos.map((p) => p.roll.toLowerCase()));
    return list.rolls.map((c) => ({ ...c, status: done.has(c.roll.toLowerCase()) ? 'Success' : 'Pending' }));
  }, [list, photos]);
  // One photo per candidate: a retake REPLACES the earlier photo, so the ZIP only has the latest.
  // The photo is persisted (IndexedDB, plus a file on desktop) BEFORE it is shown as saved.
  const addPhoto = async (p) => {
    await savePhoto(activeExam, p);
    setPhotos((ps) => {
      ps.filter((x) => x.roll.toLowerCase() === p.roll.toLowerCase()).forEach((x) => URL.revokeObjectURL(x.url));
      return [p, ...ps.filter((x) => x.roll.toLowerCase() !== p.roll.toLowerCase())];
    });
  };
  useEffect(() => { loadModels().catch(() => {}); requestPersistence(); desktop()?.getInfo().then(setInfo).catch(() => {}); }, []);

  // Restore the saved list + photos of this exam (after refresh / reopening the app).
  useEffect(() => {
    if (!activeExam) return;
    let alive = true;
    setLoading(true); setStorageErr('');
    (async () => {
      let ph = [];
      try { ph = await loadPhotos(activeExam); } catch (e) { setStorageErr(`Saved photos could not be loaded: ${e.message}`); }
      if (!alive) return;
      setList(readList(activeExam)); setPhotos(ph);
      loadedFor.current = activeExam; setLoading(false);
    })();
    return () => { alive = false; };
  }, [activeExam]);
  useEffect(() => {
    if (activeExam && loadedFor.current === activeExam) localStorage.setItem(listKey(activeExam), JSON.stringify(list));
  }, [list, activeExam]);
  const wipe = () => { clearExamPhotos(activeExam).catch(() => {}); setPhotos([]); };
  const clearList = () => { setList({ rolls: [], fileName: '', skipped: 0 }); wipe(); };

  const goTo = (s) => { window.history.pushState({ s }, ''); setStep(s); };
  const goBack = () => window.history.back();
  useEffect(() => {
    window.history.replaceState({ s: 'login' }, '');
    const onPop = (e) => setStep(e.state?.s || 'login');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="app">
      <header>
        <span className="hl">
          {step !== 'login' && <button className="backarrow" onClick={goBack} aria-label="Go back" title="Go back">←</button>}
          <b>Exam ID – Centre</b>
        </span>
        {examId && step !== 'login' && <span>Exam: {examId}</span>}
      </header>
      <main>
        {step === 'login' && <Login examId={examId} setExamId={setExamId} next={() => { const id = examId.trim(); localStorage.setItem('examCapture.lastExam', id); setActiveExam(id); goTo('upload'); }} />}
        {step === 'upload' && (
          <Upload examId={examId} count={list.rolls.length} fileName={list.fileName} skipped={list.skipped} photos={photos}
            loading={loading} storageErr={storageErr}
            onLoad={(rolls, fileName, skipped) => { setList({ rolls, fileName, skipped }); wipe(); }}
            onClear={clearList} startCapture={() => goTo('select')} />
        )}
        {step === 'select' && (
          <Select examId={examId} candidates={candidates} photos={photos} info={info}
            openCamera={(roll) => { setSelectedRoll(roll); goTo('camera'); }} />
        )}
        {step === 'camera' && (
          // key = roll: a different candidate always gets a fresh camera session and state
          <Camera key={selectedRoll} roll={selectedRoll} candidates={candidates} photos={photos} addPhoto={addPhoto}
            back={goBack} nextCandidate={() => { setSelectedRoll(''); goBack(); }} />
        )}
      </main>
    </div>
  );
}
