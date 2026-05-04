const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const http = require('http');
const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

let bubbleWin = null;
let overlayWin = null;
let tray = null; // Menu bar tray
let toastWin = null;
let screenOverlayWin = null;
let regionSelectWin = null;
let isOverlayOpen = false;
let isBubbleEnabled = true; // auto-enabled — no web app needed
let toastTimer = null;
let isClickModeActive = false;
let clickModeLang = 'hi-IN';

// ── Recording state (managed in main process) ─────────────────────────────────
let isRecording = false;

let widgetConfig = { mode: 'nativeToEnglish', languages: ['hi-IN'] };
let lastFrontApp = null; // track which app was active before overlay opened

// ── Persist widget config to disk ─────────────────────────────────────────────
// CONFIG_FILE is resolved after app is ready (app.getPath needs ready state)
let CONFIG_FILE = path.join(os.homedir(), '.seedlingspeaks-widget-config.json');

function loadWidgetConfig() {
  try {
    // Resolve to userData path once app is ready
    try { CONFIG_FILE = path.join(app.getPath('userData'), 'widget-config.json'); } catch {}
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (saved && Array.isArray(saved.languages) && saved.languages.length > 0) {
        widgetConfig = { mode: 'nativeToEnglish', languages: saved.languages };
      }
    }
  } catch {}
}

function saveWidgetConfig() {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(widgetConfig), 'utf8'); } catch {}
}

// ── Control server ────────────────────────────────────────────────────────────
function startControlServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/status') {
      res.writeHead(200); res.end(JSON.stringify({ enabled: isBubbleEnabled }));
    } else if (req.url === '/config' && req.method === 'GET') {
      res.writeHead(200); res.end(JSON.stringify(widgetConfig));
    } else if (req.url === '/config' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const inc = JSON.parse(body);
          widgetConfig = {
            mode: 'nativeToEnglish',
            languages: Array.isArray(inc.languages) && inc.languages.length > 0 ? inc.languages : ['hi-IN'],
          };
          saveWidgetConfig();
          if (overlayWin) overlayWin.webContents.send('set-config', widgetConfig);
          res.writeHead(200); res.end(JSON.stringify(widgetConfig));
        } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'bad payload' })); }
      });
      return;
    } else if (req.url === '/enable') {
      isBubbleEnabled = true; if (bubbleWin) bubbleWin.show();
      res.writeHead(200); res.end(JSON.stringify({ enabled: true }));
    } else if (req.url === '/disable') {
      isBubbleEnabled = false; if (bubbleWin) bubbleWin.hide();
      hideOverlay();
      res.writeHead(200); res.end(JSON.stringify({ enabled: false }));
    } else if (req.url === '/toggle') {
      isBubbleEnabled = !isBubbleEnabled;
      if (isBubbleEnabled) { if (bubbleWin) bubbleWin.show(); }
      else { if (bubbleWin) bubbleWin.hide(); hideOverlay(); }
      res.writeHead(200); res.end(JSON.stringify({ enabled: isBubbleEnabled }));
    } else {
      res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.warn('Port 27182 in use — killing old process and retrying…');
      const { spawnSync: sp } = require('child_process');
      sp('sh', ['-c', 'lsof -ti :27182 | xargs kill -9'], { encoding: 'utf8' });
      setTimeout(() => server.listen(27182, '127.0.0.1'), 500);
    }
  });
  server.listen(27182, '127.0.0.1', () => console.log('Control server: http://127.0.0.1:27182'));
}

// ── Tray (Menu Bar) ───────────────────────────────────────────────────────────
function createTray() {
  const { Tray, Menu } = require('electron');
  // Use the same icon.png for the tray (Electron will scale it)
  tray = new Tray(path.join(__dirname, 'icon.png'));
  updateTrayMenu();
  tray.setToolTip('SeedlingSpeaks Widget');
}

function updateTrayMenu() {
  const { Menu } = require('electron');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'SeedlingSpeaks Widget', enabled: false },
    { type: 'separator' },
    { 
      label: 'Enable Floating Widget', 
      type: 'checkbox', 
      checked: isBubbleEnabled,
      click: () => toggleWidgetState()
    },
    { type: 'separator' },
    { label: 'Open Settings', click: () => showOverlay('nativeToEnglish') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleWidgetState() {
  isBubbleEnabled = !isBubbleEnabled;
  if (isBubbleEnabled) {
    if (bubbleWin) bubbleWin.show();
    showToast({ type: 'success', message: 'Widget Enabled' }, 2000);
  } else {
    if (bubbleWin) bubbleWin.hide();
    hideOverlay();
    showToast({ type: 'info', message: 'Widget Disabled' }, 2000);
  }
  updateTrayMenu();
}

// ── Screenshot helper — uses macOS screencapture ──────────────────────────────
async function captureScreen() {
  const tmpFile = path.join(os.tmpdir(), `vt_ss_${Date.now()}.png`);
  const r = spawnSync('screencapture', ['-x', '-t', 'png', tmpFile], {
    encoding: 'utf8', timeout: 10000,
  });
  const stderr = (r.stderr || '').toLowerCase();
  const permissionError =
    stderr.includes('could not create image') ||
    stderr.includes('no displays') ||
    stderr.includes('permission') ||
    (r.status !== 0 && !fs.existsSync(tmpFile));

  if (permissionError) {
    const err = new Error('SCREEN_PERMISSION');
    err.isPermission = true;
    throw err;
  }
  if (r.error || !fs.existsSync(tmpFile)) {
    throw new Error('screencapture failed: ' + (r.stderr || r.error?.message || 'unknown'));
  }
  const buf = fs.readFileSync(tmpFile);
  try { fs.unlinkSync(tmpFile); } catch {}
  return buf;
}

function handleCaptureError(e) {
  if (e.isPermission || e.message === 'SCREEN_PERMISSION') {
    showToast({
      type: 'error',
      message: '⚠ Screen Recording permission needed.\nGo to: System Settings → Privacy & Security → Screen Recording → enable Electron',
    }, 8000);
  } else {
    showToast({ type: 'error', message: '⚠ Capture failed. ' + e.message }, 5000);
  }
}

// Crop a PNG buffer using macOS sips
function cropPng(srcPath, x, y, w, h) {
  const dstPath = path.join(os.tmpdir(), `vt_crop_${Date.now()}.png`);
  const r = spawnSync('sips', [
    '-c', String(Math.round(h)), String(Math.round(w)),
    '--cropOffset', String(Math.round(y)), String(Math.round(x)),
    srcPath, '-o', dstPath,
  ], { encoding: 'utf8', timeout: 8000 });
  if (!r.error && fs.existsSync(dstPath)) return dstPath;
  return null;
}

// Call vision-translate API
function visionTranslate(imgPath, lang) {
  const r = spawnSync('curl', [
    '-s', '-X', 'POST',
    'https://seedlingspeaks-backend-0vkj.onrender.com/api/vision-translate',
    '-F', `file=@${imgPath};type=image/png`,
    '-F', `target_language=${lang}`,
  ], { encoding: 'utf8', timeout: 60000 });
  if (r.error || r.status !== 0) throw new Error(r.stderr || 'curl failed');
  return JSON.parse(r.stdout);
}

// ── Bubble hint tooltip window ────────────────────────────────────────────────
let hintWin = null;

function createHintWin() {
  hintWin = new BrowserWindow({
    width: 260, height: 34,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:transparent;overflow:hidden;display:flex;align-items:center;justify-content:center;height:34px;}
    .tip{background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      font-size:11px;font-weight:500;padding:5px 12px;border-radius:8px;white-space:nowrap;
      box-shadow:0 2px 10px rgba(0,0,0,0.25);animation:fadein 0.12s ease;}
    @keyframes fadein{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
    kbd{background:rgba(255,255,255,0.18);border-radius:3px;padding:1px 5px;font-size:10px;font-family:inherit;color:#fff;border:none;}
  </style></head><body>
  <div class="tip" id="tip">hint</div>
  <script>
    const {ipcRenderer}=require('electron');
    ipcRenderer.on('hint-text',(_, msg)=>{
      document.getElementById('tip').textContent = msg;
    });
  <\/script></body></html>`;
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  hintWin.loadURL(dataUrl);
  hintWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hintWin.setAlwaysOnTop(true, 'screen-saver');
  hintWin.setIgnoreMouseEvents(true);
  hintWin.on('closed', () => { hintWin = null; });
}

function showBubbleHint(message) {
  if (!hintWin) createHintWin();
  if (!bubbleWin) return;
  const [bx, by] = bubbleWin.getPosition();
  const [bw] = bubbleWin.getSize();
  const hw = 260, hh = 34;
  const x = Math.round(bx + bw / 2 - hw / 2);
  const y = by - hh - 6;
  hintWin.setPosition(x, y);
  hintWin.webContents.send('hint-text', message);
  hintWin.showInactive();
}

function hideBubbleHint() {
  if (hintWin) hintWin.hide();
}

ipcMain.on('show-bubble-hint', (_, { message }) => showBubbleHint(message));
ipcMain.on('hide-bubble-hint', () => hideBubbleHint());

// ── Track last active browser URL (captured before overlay shows) ─────────────
let lastActiveUrl = '';
let lastActiveApp = '';

function captureActiveContext() {
  // Get frontmost app first
  const appR = spawnSync('osascript', ['-e',
    `tell application "System Events" to get name of first process whose frontmost is true`
  ], { encoding: 'utf8', timeout: 1500 });
  lastActiveApp = (appR.stdout || '').trim().toLowerCase();

  // Only check browser URLs if a browser is actually the frontmost app.
  // If the user is in Kiro/VSCode/etc, don't steal their browser tabs.
  const browserNames = ['google chrome', 'brave browser', 'microsoft edge', 'safari', 'firefox'];
  const isBrowserFront = browserNames.some(b => lastActiveApp.includes(b.split(' ')[0]));

  lastActiveUrl = '';
  if (isBrowserFront) {
    const urlScripts = [
      `tell application "Google Chrome" to get URL of active tab of front window`,
      `tell application "Brave Browser" to get URL of active tab of front window`,
      `tell application "Microsoft Edge" to get URL of active tab of front window`,
      `tell application "Safari" to get URL of current tab of front window`,
    ];
    for (const script of urlScripts) {
      const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 1500 });
      const out = (r.stdout || '').trim();
      if (!r.error && r.status === 0 && out && !out.includes('error') && !out.includes('execution error')) {
        lastActiveUrl = out;
        break;
      }
    }
  }
  console.log('[context] frontmost:', lastActiveApp, 'isBrowser:', isBrowserFront, 'url:', lastActiveUrl);
}
function startRecording() {
  if (!isBubbleEnabled || isRecording) return;
  // Capture the active app/URL BEFORE we do anything — this is the user's target
  captureActiveContext();
  isRecording = true;
  if (bubbleWin) bubbleWin.webContents.send('recording-state', true);
  // Don't show overlay during recording — bubble handles the UI
  if (!overlayWin) createOverlay();
  overlayWin.webContents.send('start-recording');
  overlayWin.webContents.send('set-config', widgetConfig);
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (bubbleWin) bubbleWin.webContents.send('recording-state', false);
  if (overlayWin) overlayWin.webContents.send('stop-recording');
}

function cancelRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (bubbleWin) bubbleWin.webContents.send('recording-state', false);
  if (overlayWin) overlayWin.webContents.send('cancel-recording');
}

function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function createBubble() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const bw = 180, bh = 40;
  bubbleWin = new BrowserWindow({
    width: bw, height: bh,
    x: Math.round(width / 2 - bw / 2), y: height - bh - 20,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: true, hasShadow: false,
    show: isBubbleEnabled, // auto-show if enabled
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  bubbleWin.loadFile('bubble.html');
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.on('closed', () => { bubbleWin = null; });
}

// ── Mode menu removed ─────────────────────────────────────────────────────────

// ── Overlay (translation panel) ───────────────────────────────────────────────
function createOverlay() {
  overlayWin = new BrowserWindow({
    width: 380, height: 200,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: true, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  overlayWin.loadFile('overlay.html');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.on('closed', () => { overlayWin = null; isOverlayOpen = false; });
}

function positionOverlay() {
  if (!overlayWin || !bubbleWin) return;
  const [bx, by] = bubbleWin.getPosition();
  const [bw] = bubbleWin.getSize();
  const [ow, oh] = overlayWin.getSize();
  const display = screen.getDisplayNearestPoint({ x: bx, y: by });
  const wa = display.workArea;
  let x = bx - Math.round((ow - bw) / 2);
  let y = by - oh - 10;
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - ow - 8));
  y = Math.max(wa.y + 8, y);
  overlayWin.setPosition(Math.round(x), Math.round(y));
}

function showOverlay(mode) {
  if (!overlayWin) createOverlay();
  positionOverlay();
  overlayWin.show(); overlayWin.focus();
  isOverlayOpen = true;
  if (mode) {
    widgetConfig.mode = mode;
    overlayWin.webContents.send('set-mode', mode);
  }
  overlayWin.webContents.send('set-config', widgetConfig);
  if (bubbleWin) bubbleWin.webContents.send('panel-state', true);
}

function hideOverlay() {
  if (overlayWin && isOverlayOpen) {
    overlayWin.hide();
    overlayWin.blur();
    isOverlayOpen = false;
    if (bubbleWin) bubbleWin.webContents.send('panel-state', false);
  }
}

// ── Screen overlay — ALWAYS click-through, only shows labels ─────────────────
function createScreenOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  screenOverlayWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  screenOverlayWin.loadFile('screen-overlay.html');
  screenOverlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  screenOverlayWin.setAlwaysOnTop(true, 'screen-saver');
  // ALWAYS ignore mouse events — this window NEVER blocks the screen
  screenOverlayWin.setIgnoreMouseEvents(true, { forward: true });
  screenOverlayWin.on('closed', () => { screenOverlayWin = null; });
}

function ensureScreenOverlay() {
  if (!screenOverlayWin) createScreenOverlay();
  if (!screenOverlayWin.isVisible()) screenOverlayWin.show();
}

function clearScreenOverlay() {
  if (screenOverlayWin) {
    screenOverlayWin.webContents.send('clear');
  }
}

// ── Region select window — temporary, closes after drag ──────────────────────
let regionSelectorTimeout = null;

function openRegionSelector(lang) {
  if (regionSelectWin) { try { regionSelectWin.close(); } catch {} regionSelectWin = null; }
  if (regionSelectorTimeout) { clearTimeout(regionSelectorTimeout); regionSelectorTimeout = null; }

  const { bounds } = screen.getPrimaryDisplay();
  regionSelectWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  regionSelectWin.loadFile('region-select.html');
  regionSelectWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  regionSelectWin.setAlwaysOnTop(true, 'screen-saver');
  regionSelectWin.setIgnoreMouseEvents(false);
  regionSelectWin.on('closed', () => {
    regionSelectWin = null;
    if (regionSelectorTimeout) { clearTimeout(regionSelectorTimeout); regionSelectorTimeout = null; }
  });
  regionSelectWin.once('ready-to-show', () => {
    regionSelectWin.show();
    regionSelectWin.focus();
    regionSelectWin.webContents.send('init', { lang });
    // Safety timeout — if user doesn't select within 30s, auto-close to unfreeze screen
    regionSelectorTimeout = setTimeout(() => {
      closeRegionSelector();
      showToast({ type: 'info', message: 'Region selection timed out.' }, 3000);
    }, 30000);
  });
}

function closeRegionSelector() {
  if (regionSelectorTimeout) { clearTimeout(regionSelectorTimeout); regionSelectorTimeout = null; }
  if (regionSelectWin) {
    try { regionSelectWin.close(); } catch {}
    regionSelectWin = null;
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function createToast() {
  toastWin = new BrowserWindow({
    width: 360, height: 100,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  toastWin.loadFile('toast.html');
  toastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.on('closed', () => { toastWin = null; });
}

function positionToast() {
  if (!toastWin || !bubbleWin) return;
  const [bx, by] = bubbleWin.getPosition();
  const [bw] = bubbleWin.getSize();
  const [tw, th] = toastWin.getSize();
  const display = screen.getDisplayNearestPoint({ x: bx, y: by });
  const wa = display.workArea;
  let x = bx - Math.round((tw - bw) / 2);
  let y = by - th - 14;
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - tw - 8));
  y = Math.max(wa.y + 8, y);
  toastWin.setPosition(Math.round(x), Math.round(y));
}

function showToast(data, autoDismissMs = 4000) {
  if (!toastWin) createToast();
  const lines = Math.ceil((data.message || '').length / 38);
  const h = Math.min(Math.max(80, 60 + lines * 20), 180);
  toastWin.setSize(360, h);
  positionToast();
  toastWin.showInactive();
  toastWin.webContents.send('toast-data', data);
  if (toastTimer) clearTimeout(toastTimer);
  if (autoDismissMs > 0) {
    toastTimer = setTimeout(() => { if (toastWin) toastWin.hide(); }, autoDismissMs);
  }
}

// ── Startup permission check ──────────────────────────────────────────────────
function checkScreenPermission() {
  const testFile = path.join(os.tmpdir(), `vt_permcheck_${Date.now()}.png`);
  const r = spawnSync('screencapture', ['-x', '-t', 'png', testFile], {
    encoding: 'utf8', timeout: 5000,
  });
  const ok = !r.error && fs.existsSync(testFile);
  try { if (ok) fs.unlinkSync(testFile); } catch {}
  return ok;
}

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startControlServer();
  createTray();
  createBubble();
  createOverlay();
  createToast();
  createScreenOverlay();

  // ── fn key push-to-talk via native IOHIDManager watcher ──────────────────
  const { spawn } = require('child_process');
  const fnWatcherPath = path.join(__dirname, 'fn_watcher');

  // Check Input Monitoring permission — if missing, open System Settings directly
  function checkAndRequestInputMonitoring() {
    const test = spawnSync(fnWatcherPath, [], {
      timeout: 1500, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // If it exits immediately with no output, permission is likely denied
    const denied = test.status !== null && test.status !== 0 && !test.stdout?.trim();
    if (denied || (test.stderr || '').toLowerCase().includes('not permitted')) {
      // Open Input Monitoring pane directly
      spawnSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'], { encoding: 'utf8' });
      showToast({
        type: 'info',
        message: '⚠ Enable Input Monitoring for Electron\nSystem Settings → Privacy → Input Monitoring',
      }, 10000);
      return false;
    }
    return true;
  }

  try {
    const fnProc = spawn(fnWatcherPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    let pressStart = 0;
    const MIN_HOLD_MS = 300;
    let buf = '';
    let permissionChecked = false;

    fnProc.stderr?.on('data', (chunk) => {
      const msg = chunk.toString().toLowerCase();
      if (!permissionChecked && (msg.includes('not permitted') || msg.includes('denied'))) {
        permissionChecked = true;
        spawnSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'], { encoding: 'utf8' });
        showToast({
          type: 'info',
          message: '⚠ Enable Input Monitoring for Electron\nSystem Settings → Privacy → Input Monitoring',
        }, 10000);
      }
    });

    fnProc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const ev = line.trim();
        if (ev === 'down') {
          pressStart = Date.now();
          if (isBubbleEnabled && !isRecording) startRecording();
        } else if (ev === 'up') {
          const held = Date.now() - pressStart;
          if (!isRecording) return;
          if (held >= MIN_HOLD_MS) stopRecording();
          else cancelRecording();
        }
      }
    });

    fnProc.on('error', (e) => console.error('[fn_watcher] error:', e.message));
    fnProc.on('exit', (code) => {
      if (code !== 0) {
        // Likely permission denied — open settings
        spawnSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'], { encoding: 'utf8' });
        showToast({
          type: 'info',
          message: '⚠ Enable Input Monitoring for Electron\nSystem Settings → Privacy → Input Monitoring',
        }, 10000);
      }
    });

    app.on('will-quit', () => { try { fnProc.kill(); } catch {} });
    console.log('[shortcut] fn key push-to-talk active via IOHIDManager');

  } catch (e) {
    console.error('[fn_watcher] failed to start:', e.message);
  }

  // ── Fallback: F13 via uiohook-napi if fn_watcher fails ───────────────────
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const TRIGGER = UiohookKey.F13;
    let keyDown = false;
    let pressStart = 0;
    const MIN_HOLD_MS = 300;

    uIOhook.on('keydown', (e) => {
      if (e.keycode !== TRIGGER || keyDown) return;
      keyDown = true;
      pressStart = Date.now();
      if (isBubbleEnabled && !isRecording) startRecording();
    });

    uIOhook.on('keyup', (e) => {
      if (e.keycode !== TRIGGER) return;
      keyDown = false;
      const held = Date.now() - pressStart;
      if (!isRecording) return;
      if (held >= MIN_HOLD_MS) stopRecording();
      else cancelRecording();
    });

    uIOhook.start();
    console.log('[shortcut] F13 fallback push-to-talk active');
  } catch (e) {
    console.error('[shortcut] uiohook-napi failed:', e.message);
    // Fallback to toggle shortcut
    const sc = process.platform === 'darwin' ? 'Command+Shift+R' : 'Control+Shift+R';
    const ok = globalShortcut.register(sc, () => toggleRecording());
    console.log(`[shortcut] Fallback ${sc}: ${ok ? 'registered' : 'failed'}`);
  }
});

app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { require('uiohook-napi').uIOhook.stop(); } catch {}
});

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('toggle-panel', () => {
  if (!isBubbleEnabled) return;
  if (isOverlayOpen) hideOverlay();
  else showOverlay('nativeToEnglish');
});

ipcMain.on('select-mode', (_, mode) => { showOverlay(mode); });
ipcMain.on('hide-overlay', () => hideOverlay());

ipcMain.on('bubble-clicked', () => toggleRecording());
ipcMain.on('stop-recording-ipc', () => stopRecording());

ipcMain.on('show-bubble-menu', (event) => {
  const { Menu, MenuItem } = require('electron');
  const menu = new Menu();
  menu.append(new MenuItem({ label: 'SeedlingSpeaks Widget', enabled: false }));
  menu.append(new MenuItem({ type: 'separator' }));
  menu.append(new MenuItem({ label: 'Open Settings', click: () => showOverlay('nativeToEnglish') }));
  menu.append(new MenuItem({ type: 'separator' }));
  menu.append(new MenuItem({ label: 'Quit', click: () => app.quit() }));
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.on('quit-app', () => app.quit());

// ── Live transcript update → forward to overlay ───────────────────────────────
ipcMain.on('live-transcript-update', (_, text) => {
  if (overlayWin) overlayWin.webContents.send('live-transcript', text);
});

// ── Dynamic overlay resize ────────────────────────────────────────────────────
ipcMain.on('resize-overlay', (_, { height }) => {
  if (!overlayWin) return;
  const [w] = overlayWin.getSize();
  const newH = Math.max(120, Math.min(height, 800));
  const [cx, cy] = overlayWin.getPosition();
  const [, oldH] = overlayWin.getSize();
  overlayWin.setSize(w, newH);
  // Keep bottom edge anchored (card grows upward)
  const dy = oldH - newH;
  overlayWin.setPosition(cx, cy + dy);
});

// ── Cancel recording (X button during recording) ──────────────────────────────
ipcMain.on('cancel-recording', () => {
  isRecording = false;
  if (bubbleWin) bubbleWin.webContents.send('recording-state', false);
  hideOverlay();
});

ipcMain.on('recording-result', (_, { transcript }) => {
  isRecording = false;
  if (bubbleWin) bubbleWin.webContents.send('recording-state', false);
  // Context was already captured at startRecording() — don't overwrite it here
  if (!overlayWin) createOverlay();
  positionOverlay();
  overlayWin.show();
  overlayWin.focus();
  isOverlayOpen = true;
  overlayWin.webContents.send('show-result', { transcript });
});

// Dev: Cmd+Shift+I opens DevTools on overlay
ipcMain.on('open-devtools', () => { if (overlayWin) overlayWin.webContents.openDevTools({ mode: 'detach' }); });

ipcMain.on('show-toast', (_, data) => {
  const ms = data.type === 'info' ? 6000 : data.type === 'loading' ? 0 : 4000;
  showToast(data, ms);
});

ipcMain.on('hide-toast', () => {
  if (toastWin) toastWin.hide();
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
});

ipcMain.on('bubble-drag', (_, { x, y }) => {
  if (bubbleWin && typeof x === 'number' && typeof y === 'number') {
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (!isNaN(nx) && !isNaN(ny)) {
      bubbleWin.setPosition(nx, ny);
      if (isOverlayOpen) positionOverlay();
    }
  }
});

ipcMain.handle('get-bubble-pos', () => {
  if (!bubbleWin) return { x: 0, y: 0 };
  const [x, y] = bubbleWin.getPosition();
  return { x, y };
});

// ── Screen translation actions ────────────────────────────────────────────────

// TRANSLATE FULL SCREEN
ipcMain.on('action-translate-screen', async (_, { lang, mode }) => {
  const tgtLang = mode === 'nativeToEnglish' ? 'en-IN' : (lang || 'hi-IN');

  if (overlayWin) overlayWin.hide();
  if (toastWin) toastWin.hide();
  if (screenOverlayWin) screenOverlayWin.hide();
  await new Promise(r => setTimeout(r, 300));

  showToast({ type: 'loading', message: 'Scanning screen…' }, 0);

  try {
    const pngBuf = await captureScreen();
    const tmpImg = path.join(os.tmpdir(), `vt_screen_${Date.now()}.png`);
    fs.writeFileSync(tmpImg, pngBuf);

    showToast({ type: 'loading', message: 'Translating screen text…' }, 0);

    const data = visionTranslate(tmpImg, tgtLang);
    try { fs.unlinkSync(tmpImg); } catch {}

    const regions = data.regions || [];
    if (regions.length === 0) {
      showToast({ type: 'info', message: 'No text found on screen.' }, 4000);
      return;
    }

    ensureScreenOverlay();
    const { bounds } = screen.getPrimaryDisplay();
    screenOverlayWin.webContents.send('show-translations', {
      regions, offsetX: 0, offsetY: 0,
      screenWidth: bounds.width, screenHeight: bounds.height,
    });
    showToast({ type: 'success', message: `✓ Translated ${regions.length} text regions on screen` }, 5000);

  } catch (e) {
    console.error('action-translate-screen error:', e);
    handleCaptureError(e);
  }
});

// SELECT REGION — opens a temporary full-screen selector window
ipcMain.on('action-translate-region', (_, { lang, mode }) => {
  const tgtLang = mode === 'nativeToEnglish' ? 'en-IN' : (lang || 'hi-IN');
  if (toastWin) toastWin.hide();
  // Show a hint toast so user knows what to do
  showToast({ type: 'info', message: 'Drag to select a region. Press Esc to cancel.' }, 0);
  openRegionSelector(tgtLang);
});

// Region selector sends this when drag is complete
ipcMain.on('region-selected', async (_, { x, y, w, h, lang }) => {
  closeRegionSelector();
  if (toastWin) toastWin.hide();
  await new Promise(r => setTimeout(r, 200)); // let region window fully close
  showToast({ type: 'loading', message: 'Translating selected region…' }, 0);

  try {
    const pngBuf = await captureScreen();
    const tmpImg = path.join(os.tmpdir(), `vt_full_${Date.now()}.png`);
    fs.writeFileSync(tmpImg, pngBuf);

    const croppedPath = cropPng(tmpImg, x, y, w, h);
    try { fs.unlinkSync(tmpImg); } catch {}

    const imgToSend = croppedPath || tmpImg;
    const data = visionTranslate(imgToSend, lang);
    if (croppedPath) try { fs.unlinkSync(croppedPath); } catch {}

    const regions = data.regions || [];
    if (regions.length === 0) {
      showToast({ type: 'info', message: 'No text found in selected region.' }, 4000);
      return;
    }

    ensureScreenOverlay();
    screenOverlayWin.webContents.send('show-translations', {
      regions, offsetX: x, offsetY: y,
      screenWidth: w, screenHeight: h,
    });
    showToast({ type: 'success', message: `✓ Translated ${regions.length} text regions` }, 4000);

  } catch (e) {
    console.error('region-selected error:', e);
    handleCaptureError(e);
  }
});

// Region selector cancelled (Esc or timeout)
ipcMain.on('region-cancelled', () => {
  closeRegionSelector();
  if (toastWin) toastWin.hide();
});

// CLICK MODE — transparent full-screen overlay captures real mouse clicks
// User just clicks on any text in any app — no keyboard shortcut needed
let clickOverlayWin = null;

function openClickOverlay(lang) {
  if (clickOverlayWin) { try { clickOverlayWin.close(); } catch {} clickOverlayWin = null; }

  const { bounds } = screen.getPrimaryDisplay();
  clickOverlayWin = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  clickOverlayWin.loadFile('click-overlay.html');
  clickOverlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  clickOverlayWin.setAlwaysOnTop(true, 'screen-saver');
  // Captures clicks but forwards everything else
  clickOverlayWin.setIgnoreMouseEvents(false);
  clickOverlayWin.on('closed', () => {
    clickOverlayWin = null;
    isClickModeActive = false;
    if (bubbleWin) bubbleWin.webContents.send('screen-mode', false);
  });
  clickOverlayWin.once('ready-to-show', () => {
    clickOverlayWin.show();
    clickOverlayWin.webContents.send('init', { lang });
  });
}

function closeClickOverlay() {
  if (clickOverlayWin) { try { clickOverlayWin.close(); } catch {} clickOverlayWin = null; }
}

ipcMain.on('action-click-mode', (_, { lang, mode }) => {
  const tgtLang = mode === 'nativeToEnglish' ? 'en-IN' : (lang || 'hi-IN');
  isClickModeActive = true;
  clickModeLang = tgtLang;
  openClickOverlay(tgtLang);
  if (bubbleWin) bubbleWin.webContents.send('screen-mode', true);
});

// ── Accessibility text reader (macOS AX API — works on ANY app, no screenshot) ──
const AX_HELPER = path.join(__dirname, 'ax_text_at_cursor');

function getTextViaAX(x, y) {
  try {
    const r = spawnSync(AX_HELPER, [String(x), String(y)], { encoding: 'utf8', timeout: 3000 });
    if (r.error || r.status !== 0) return null;
    const parsed = JSON.parse(r.stdout.trim());
    return parsed.text && parsed.text.trim() ? parsed.text.trim() : null;
  } catch { return null; }
}

// Translate plain text via backend
function translateText(text, lang) {
  const body = JSON.stringify({
    text,
    source_language: 'en-IN',
    target_language: lang,
  });
  const r = spawnSync('curl', [
    '-s', '-X', 'POST',
    'https://seedlingspeaks-backend-0vkj.onrender.com/api/translate-text',
    '-H', 'Content-Type: application/json',
    '-d', body,
  ], { encoding: 'utf8', timeout: 30000 });
  if (r.error || r.status !== 0) throw new Error(r.stderr || 'curl failed');
  return JSON.parse(r.stdout);
}

// Called from click-overlay.html when user clicks on screen
ipcMain.on('click-translate', async (_, { x, y, lang }) => {
  try {
    // ── FAST PATH: try Accessibility API first (instant, no screenshot needed) ──
    const axText = getTextViaAX(x, y);

    if (axText) {
      // Got text directly from the app — translate it immediately
      const data = translateText(axText, lang);
      const translated = data.translated_text || axText;

      if (clickOverlayWin) {
        clickOverlayWin.webContents.send('show-result', {
          regions: [{ translated, original: axText, x: 0.5, y: 0.5 }],
          offsetX: x - 150, offsetY: y - 60,
          regionW: 300, regionH: 120,
          clickX: x, clickY: y,
        });
      }
      return;
    }

    // ── FALLBACK: screenshot + OCR (for apps that block AX, like games, PDFs) ──
    if (clickOverlayWin) clickOverlayWin.hide();
    await new Promise(r => setTimeout(r, 180));

    const REGION_W = 480, REGION_H = 220;
    const { bounds } = screen.getPrimaryDisplay();
    const rx = Math.max(0, Math.min(Math.round(x - REGION_W / 2), bounds.width - REGION_W));
    const ry = Math.max(0, Math.min(Math.round(y - REGION_H / 2), bounds.height - REGION_H));

    const pngBuf = await captureScreen();
    const tmpImg = path.join(os.tmpdir(), `vt_click_${Date.now()}.png`);
    fs.writeFileSync(tmpImg, pngBuf);

    const croppedPath = cropPng(tmpImg, rx, ry, REGION_W, REGION_H);
    try { fs.unlinkSync(tmpImg); } catch {}

    const imgToSend = croppedPath || tmpImg;
    const data = visionTranslate(imgToSend, lang);
    if (croppedPath) try { fs.unlinkSync(croppedPath); } catch {}

    if (clickOverlayWin) {
      clickOverlayWin.show();
      const regions = data.regions || [];
      clickOverlayWin.webContents.send('show-result', {
        regions, offsetX: rx, offsetY: ry,
        regionW: REGION_W, regionH: REGION_H,
        clickX: x, clickY: y,
        message: regions.length === 0 ? 'No text found here' : null,
      });
    }
  } catch (e) {
    if (clickOverlayWin) clickOverlayWin.show();
    console.error('click-translate error:', e);
    handleCaptureError(e);
  }
});

ipcMain.on('stop-click-mode', () => {
  isClickModeActive = false;
  closeClickOverlay();
  if (bubbleWin) bubbleWin.webContents.send('screen-mode', false);
  if (toastWin) toastWin.hide();
});

// RESTORE — clear all screen overlays
ipcMain.on('action-restore', () => {
  isClickModeActive = false;
  closeClickOverlay();
  clearScreenOverlay();
  if (bubbleWin) bubbleWin.webContents.send('screen-mode', false);
  showToast({ type: 'success', message: '✓ Screen restored' }, 3000);
});

// Stop screen mode from overlay's stop button
ipcMain.on('stop-screen-mode', () => {
  isClickModeActive = false;
  closeClickOverlay();
  clearScreenOverlay();
  if (bubbleWin) bubbleWin.webContents.send('screen-mode', false);
  if (toastWin) toastWin.hide();
});

// ── Detect frontmost app + active browser URL ─────────────────────────────────
ipcMain.on('get-active-url', (event) => {
  // 1. Try to get URL from frontmost browser via AppleScript
  const browsers = [
    { name: 'Google Chrome',  script: `tell application "Google Chrome" to get URL of active tab of front window` },
    { name: 'Safari',         script: `tell application "Safari" to get URL of current tab of front window` },
    { name: 'Microsoft Edge', script: `tell application "Microsoft Edge" to get URL of active tab of front window` },
    { name: 'Brave Browser',  script: `tell application "Brave Browser" to get URL of active tab of front window` },
    { name: 'Firefox',        script: `tell application "Firefox" to get URL of active tab of front window` },
  ];

  let url = null;
  let appName = null;

  // Get frontmost app name first
  const frontAppResult = spawnSync('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], { encoding: 'utf8', timeout: 3000 });
  appName = (frontAppResult.stdout || '').trim();

  // Try browser URL extraction
  for (const b of browsers) {
    if (appName && !appName.toLowerCase().includes(b.name.split(' ')[0].toLowerCase())) continue;
    const r = spawnSync('osascript', ['-e', b.script], { encoding: 'utf8', timeout: 3000 });
    if (!r.error && r.status === 0 && r.stdout?.trim()) {
      url = r.stdout.trim();
      break;
    }
  }

  event.reply('active-url', url);
  event.reply('active-app', appName);
});

// ── Smart send — detect target and route ──────────────────────────────────────
ipcMain.on('smart-send', (_, { text, subject, body }) => {
  const scriptPath = path.join(__dirname, 'fill_compose.sh');

  const url = lastActiveUrl;
  const appName = lastActiveApp;
  console.log('[smart-send] stored url:', url, 'app:', appName);

  let target = 'fallback';
  if (url.includes('mail.google.com'))                                          target = 'gmail';
  else if (url.includes('slack.com'))                                           target = 'slack';
  else if (url.includes('web.whatsapp.com'))                                    target = 'whatsapp';
  else if (url.includes('linkedin.com'))                                        target = 'linkedin';
  else if (url.includes('outlook.live.com') || url.includes('outlook.office')) target = 'outlook';
  else if (appName.includes('slack'))                                           target = 'slack';
  else if (appName.includes('whatsapp'))                                        target = 'whatsapp';
  else if (appName.includes('mail') && !appName.includes('gmail'))              target = 'applemail';

  console.log('[smart-send] target:', target);

  hideOverlay();

  if (target === 'fallback') {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    showToast({ type: 'info', message: '📋 Message copied — paste it anywhere' }, 3000);
    setTimeout(() => { app.show(); if (bubbleWin) bubbleWin.show(); }, 200);
    return;
  }

  const pastTargets = ['gmail', 'linkedin', 'slack', 'whatsapp', 'outlook'];
  const needsAppHide = pastTargets.includes(target);

  if (needsAppHide) {
    // Hide the entire Electron app so macOS gives focus back to Chrome/browser.
    // This is the only reliable way to ensure Cmd+V goes to the right window.
    app.hide();
  }

  // Give macOS time to fully switch focus to the target app
  const delay = needsAppHide ? 600 : 400;

  setTimeout(() => {
    const result = spawnSync('bash', [scriptPath, target, subject || '', body || text], {
      encoding: 'utf8', timeout: 15000,
    });
    console.log('[smart-send] fill_compose result:', result.stdout, result.stderr);

    // Bring Electron back (bubble should reappear)
    if (needsAppHide) {
      setTimeout(() => {
        app.show();
        if (bubbleWin) bubbleWin.show();
      }, 500);
    }
  }, delay);
});
