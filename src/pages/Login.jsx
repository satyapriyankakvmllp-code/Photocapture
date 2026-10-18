export default function Login({ examId, setExamId, next }) {
  const ok = examId.trim().length > 0;
  return (
    <form className="card narrow" onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
      <h1>Exam ID – Centre</h1>
      <label>Exam ID
        <input autoFocus value={examId} onChange={(e) => setExamId(e.target.value)} placeholder="e.g. EXAM001" />
      </label>
      <button className="btn primary" disabled={!ok}>Next</button>
    </form>
  );
}
