// Electron main process: the ONLY place that touches the file system.
// The React app (renderer) is sandboxed and can only call the 4 functions exposed in preload.cjs.
const { app, BrowserWindow, ipcMain, protocol, net, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const DIST = path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://localhost';
const MAX_BYTES = 20 * 1024 * 1024;
const safe = (s) => String(s ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 100) || 'unnamed';

/** <folder of the .exe>/ExamPhotos, or the portable exe folder. Falls back to the per-user data dir if that is read-only. */
function dataRoot() {
  const bases = [];
  if (process.env.PORTABLE_EXECUTABLE_DIR) bases.push(process.env.PORTABLE_EXECUTABLE_DIR);
  bases.push(app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'));
  for (const b of bases) {
    const dir = path.join(b, 'ExamPhotos');
    try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch { /* try next */ }
  }
  const dir = path.join(app.getPath('userData'), 'ExamPhotos');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const examDir = (examId) => path.join(dataRoot(), safe(examId));
const trusted = (e) => (e.senderFrame?.url || '').startsWith(ORIGIN) || !!process.env.ELECTRON_DEV_URL;

ipcMain.handle('app:info', (e) => { if (!trusted(e)) throw new Error('Untrusted sender'); return { desktop: true, dir: dataRoot() }; });

ipcMain.handle('photo:save', async (e, examId, roll, data) => {
  if (!trusted(e)) throw new Error('Untrusted sender');
  const buf = Buffer.from(data);
  if (buf.length < 4 || buf.length > MAX_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a valid JPEG image.');
  const dir = examDir(examId);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safe(roll)}.jpg`);
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, file); // atomic replace: a retake overwrites the earlier photo
  return { path: file };
});

ipcMain.handle('photo:readAll', async (e, examId) => {
  if (!trusted(e)) throw new Error('Untrusted sender');
  const dir = examDir(examId);
  let names = [];
  try { names = (await fs.promises.readdir(dir)).filter((n) => /\.jpe?g$/i.test(n)); } catch { return []; }
  return Promise.all(names.map(async (fileName) => ({ fileName, data: await fs.promises.readFile(path.join(dir, fileName)) })));
});

ipcMain.handle('folder:open', async (e, examId) => {
  if (!trusted(e)) throw new Error('Untrusted sender');
  const dir = examDir(examId);
  await fs.promises.mkdir(dir, { recursive: true });
  return shell.openPath(dir);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 850, title: 'Exam ID – Centre',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith(process.env.ELECTRON_DEV_URL || '\0')) ev.preventDefault(); });
  win.loadURL(process.env.ELECTRON_DEV_URL || `${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  // Serve the built React app from app://localhost so camera (secure context) and fetch('/models/...') work.
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || !p) p = '/index.html';
    const full = path.normalize(path.join(DIST, p));
    if (!full.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });
  // Only our own page may use the camera.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) =>
    cb(permission === 'media' && (details.requestingUrl || '').startsWith(ORIGIN)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => permission === 'media' && (origin || '').startsWith(ORIGIN));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
