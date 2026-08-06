// The quick pill: an Arc/clui-style floating command pill on a global hotkey, with the slime as its
// idle skin. macOS NSPanel semantics via type:'panel' (nonactivating), so the pill takes KEYBOARD
// focus while the app the user was in STAYS frontmost; no dock bounce, no space switch. The panel is
// created hidden at enable time so hotkey-to-visible is a show(), not a window boot.

'use strict';

const path = require('path');
const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');

const OVERLAY_HOTKEY = 'Alt+Space';
const PANEL_W = 560;
const PANEL_H = 120;

let p_panel = null;
let p_enabled = false;
let p_onSubmit = null;

function p_html() {
  // Self-contained page: the slime idles beside a bare input. No remote content, no node access.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif;-webkit-user-select:none}
  .pill{display:flex;align-items:center;gap:12px;margin:10px;padding:14px 18px;border-radius:999px;
    background:rgba(28,25,33,0.92);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.14);
    box-shadow:0 18px 44px rgba(0,0,0,0.45)}
  .slime{width:34px;height:30px;position:relative;flex-shrink:0;animation:idle 2.6s ease-in-out infinite;transform-origin:50% 100%}
  .slime .body{position:absolute;inset:0;background:linear-gradient(180deg,#9ee87c,#5cc94a);border-radius:52% 52% 46% 46%/60% 60% 42% 42%;box-shadow:inset 0 -4px 8px rgba(0,0,0,0.18)}
  .slime .eye{position:absolute;top:11px;width:5px;height:7px;background:#1c2416;border-radius:50%;animation:blink 4.2s infinite}
  .slime .eye.l{left:9px}.slime .eye.r{right:9px}
  @keyframes idle{0%,100%{transform:scaleY(1) scaleX(1)}50%{transform:scaleY(0.92) scaleX(1.05)}}
  @keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(0.1)}}
  input{flex:1;border:0;outline:0;background:transparent;color:rgba(255,255,255,0.94);font-size:17px}
  input::placeholder{color:rgba(255,255,255,0.4)}
  @media (prefers-reduced-motion: reduce){.slime{animation:none}.slime .eye{animation:none}}
  </style></head><body>
  <div class="pill"><div class="slime"><div class="body"></div><div class="eye l"></div><div class="eye r"></div></div>
  <input id="q" placeholder="Ask OpenSwarm anything…" autofocus></div>
  <script>
  const q = document.getElementById('q');
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q.value.trim()) { window.overlay.submit(q.value.trim()); q.value = ''; }
    if (e.key === 'Escape') { q.value = ''; window.overlay.dismiss(); }
  });
  window.overlay.onShown(() => { q.value = ''; q.focus(); });
  </script></body></html>`;
}

function p_createPanel() {
  const panel = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    // The whole trick: a nonactivating NSPanel takes key WITHOUT activating our app or deactivating theirs.
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  panel.setAlwaysOnTop(true, 'screen-saver');
  // Re-asserted on every show too: macOS drops this across space changes.
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panel.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(p_html()));
  panel.on('blur', () => { try { panel.hide(); } catch (_) {} });
  panel.on('closed', () => { p_panel = null; });
  return panel;
}

function showOverlay() {
  if (!p_enabled) return;
  if (!p_panel || p_panel.isDestroyed()) p_panel = p_createPanel();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  p_panel.setPosition(Math.round(x + (width - PANEL_W) / 2), Math.round(y + Math.max(80, display.workArea.height * 0.18)));
  p_panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  p_panel.show();
  try { p_panel.webContents.send('overlay:shown'); } catch (_) {}
  try { p_panel.webContents.focus(); } catch (_) {}
}

function hideOverlay() {
  if (p_panel && !p_panel.isDestroyed()) p_panel.hide();
}

function toggleOverlay() {
  if (p_panel && !p_panel.isDestroyed() && p_panel.isVisible()) hideOverlay();
  else showOverlay();
}

/** Wire the hotkey + IPC once; enable/disable flips registration. onSubmit receives the typed text. */
function initOverlayPill(onSubmit) {
  p_onSubmit = onSubmit;
  ipcMain.on('overlay:submit', (_e, text) => {
    hideOverlay();
    try { if (typeof text === 'string' && text.trim() && p_onSubmit) p_onSubmit(text.trim().slice(0, 4000)); } catch (_) {}
  });
  ipcMain.on('overlay:dismiss', () => hideOverlay());
}

function setOverlayEnabled(enabled) {
  const next = Boolean(enabled);
  if (next === p_enabled) return;
  p_enabled = next;
  if (next) {
    try {
      globalShortcut.register(OVERLAY_HOTKEY, toggleOverlay);
    } catch (err) {
      console.warn('[overlay] hotkey register failed:', err && err.message);
    }
    // Pre-create hidden so the first hotkey is a show(), not a window boot.
    if (!p_panel || p_panel.isDestroyed()) p_panel = p_createPanel();
  } else {
    try { globalShortcut.unregister(OVERLAY_HOTKEY); } catch (_) {}
    if (p_panel && !p_panel.isDestroyed()) { p_panel.destroy(); p_panel = null; }
  }
}

module.exports = { initOverlayPill, setOverlayEnabled, showOverlay, hideOverlay };
