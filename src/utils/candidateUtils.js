export const safeName = (s) =>
  (String(s ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 100)) || 'unnamed';
export const makeCandidates = (rows) =>
  rows.filter((r) => r.valid).map((r, i) => ({ serial: i + 1, roll: r.roll }));
