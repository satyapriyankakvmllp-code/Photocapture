import * as XLSX from 'xlsx';
import { safeName } from './candidateUtils.js';

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ROLL = ['rollno', 'rollnumber', 'rollnum', 'roll', 'rno', 'hallticketno', 'registrationno'];

/** Reads only the Roll Number column. Other columns are ignored. */
export async function parseExcel(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Please upload a .xlsx or .xls file.');
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); }
  catch { throw new Error('This file could not be read as an Excel workbook.'); }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The workbook has no sheets.');
  // raw:false keeps text exactly as shown, so "00123" stays "00123".
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
  if (!data.length) throw new Error('The Excel file is empty.');
  let ri = data[0].map(norm).findIndex((h) => ROLL.includes(h));
  if (ri < 0) ri = 0; // no recognised header: use the first column (row 1 is treated as the header)

  const seen = new Set();
  const rows = [];
  data.slice(1).forEach((r) => {
    const roll = String(r[ri] ?? '').trim();
    if (!roll) return;
    const key = safeName(roll).toLowerCase();
    const duplicate = seen.has(key);
    seen.add(key);
    rows.push({ roll, duplicate, valid: !duplicate });
  });
  if (!rows.length) throw new Error('No roll numbers found in the file.');
  return {
    rows,
    summary: { total: rows.length, valid: rows.filter((r) => r.valid).length, invalid: rows.filter((r) => !r.valid).length },
  };
}
