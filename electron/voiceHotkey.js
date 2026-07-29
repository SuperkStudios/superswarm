const { app, globalShortcut, ipcMain, systemPreferences } = require('electron');

// Voice dictation hotkey, user-rebindable (Settings > Interface > Dictation shortcut), two tiers:
//
//   NATIVE (uiohook-napi event tap): sees real key-down AND key-up globally, in or out of focus,
//   immune to macOS's letter-keyup-under-Cmd suppression, so the keyboard gets TRUE hold-to-talk
//   exactly like the mic buttons. Listen-only (never swallows keys from other apps).
//
//   FALLBACK (globalShortcut while unfocused + before-input relay while focused): press-to-toggle,
//   key-ups undetectable there.
//
// THE TRAP THIS FILE IS SHAPED AROUND: on macOS a listen-only keyboard tap needs the Input
// Monitoring grant, which is SEPARATE from Accessibility, and a tap without it starts cleanly and
// then delivers nothing (caught live on the packaged build). So "tap started" proves nothing; the
// fallback stays armed until the tap delivers its first real key event. To keep the two paths from
// double-firing on one press, fallback sends are deferred 90ms and skipped when the tap just
// handled a key; a deaf tap never updates that timestamp, so the fallback always fires.
//
// F5 is deliberately NOT a default: macOS's media-key layer routes it to Siri before any app sees
// it. It stays bindable for users who have remapped that key at the OS level.

const DEFAULT_COMBO = process.platform === 'darwin' ? 'Meta+Shift+d' : 'Ctrl+Shift+d';
const TAP_FRESH_MS = 200;
const FALLBACK_DEFER_MS = 90;

// "Meta+Shift+d" (renderer parts format, same as new_agent_shortcut) -> matcher pieces.
function parseCombo(str) {
  const parts = String(str || DEFAULT_COMBO).split('+').filter(Boolean);
  const key = parts[parts.length - 1] || 'd';
  const mods = {
    meta: parts.includes('Meta'),
    ctrl: parts.includes('Ctrl') || parts.includes('Control'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
  };
  const accel = [
    mods.meta ? 'Meta' : null,
    mods.ctrl ? 'Control' : null,
    mods.alt ? 'Alt' : null,
    mods.shift ? 'Shift' : null,
    key.length === 1 ? key.toUpperCase() : key,
  ].filter(Boolean).join('+');
  return { key, mods, accel };
}

function uiohookKeycodeFor(key, UiohookKey) {
  if (key.length === 1 && /[a-z]/i.test(key)) return UiohookKey[key.toUpperCase()];
  if (key.length === 1 && /[0-9]/.test(key)) return UiohookKey[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return UiohookKey[key];
  if (key === ' ' || key === 'Space') return UiohookKey.Space;
  return undefined; // unmappable for the tap; the fallback tiers still cover it
}

function installVoiceHotkey(getMainWindow) {
  const send = (channel) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel);
  };

  let combo = parseCombo(DEFAULT_COMBO);
  let tapProven = false;
  let lastTapKeyMs = 0;
  let registeredAccel = null;

  const unregisterFallbackShortcut = () => {
    if (!registeredAccel) return;
    try { globalShortcut.unregister(registeredAccel); } catch (_) {}
    registeredAccel = null;
  };

  // Fallback toggle, deferred so a live tap's hold-down wins the same press.
  const sendFallbackToggle = () => {
    setTimeout(() => {
      if (Date.now() - lastTapKeyMs < TAP_FRESH_MS) return;
      send('voice:toggle');
    }, FALLBACK_DEFER_MS);
  };

  // Fallback shortcut stays registered while unfocused until the tap proves alive.
  const registerVoiceShortcut = () => {
    if (tapProven) return;
    if (registeredAccel === combo.accel) return;
    unregisterFallbackShortcut();
    try {
      if (globalShortcut.register(combo.accel, sendFallbackToggle)) registeredAccel = combo.accel;
    } catch (_) { /* a taken shortcut just means no global hotkey; the pill still works */ }
  };

  let tapKeycode;
  let UiohookKeyRef = null;

  const tryStartNativeTap = () => {
    try {
      if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
        console.log('[voice] no Accessibility grant, keyboard stays press-to-toggle');
        return false;
      }
      const { uIOhook, UiohookKey } = require('uiohook-napi');
      UiohookKeyRef = UiohookKey;
      tapKeycode = uiohookKeycodeFor(combo.key, UiohookKey);
      const MOD_KEYS = new Set([
        UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Shift, UiohookKey.ShiftRight,
        UiohookKey.Meta, UiohookKey.MetaRight, UiohookKey.Alt, UiohookKey.AltRight,
      ]);
      let held = false;

      const markAlive = () => {
        lastTapKeyMs = Date.now();
        if (!tapProven) {
          tapProven = true;
          unregisterFallbackShortcut();
          console.log('[voice] native key tap PROVEN (events flowing), hold-to-talk enabled');
        }
      };

      const modsMatch = (e) =>
        (!combo.mods.meta || e.metaKey) &&
        (!combo.mods.ctrl || e.ctrlKey) &&
        (!combo.mods.alt || e.altKey) &&
        (!combo.mods.shift || e.shiftKey);

      uIOhook.on('keydown', (e) => {
        markAlive();
        if (held || tapKeycode === undefined) return;
        if (e.keycode === tapKeycode && modsMatch(e)) {
          held = true;
          send('voice:hold-down');
        }
      });
      uIOhook.on('keyup', (e) => {
        markAlive();
        if (!held) return;
        if (e.keycode === tapKeycode || MOD_KEYS.has(e.keycode)) {
          held = false;
          send('voice:hold-up');
        }
      });

      uIOhook.start();
      app.on('will-quit', () => { try { uIOhook.stop(); } catch (_) {} });
      console.log('[voice] native key tap armed (awaiting first event to prove Input Monitoring)');
      return true;
    } catch (e) {
      console.log('[voice] native key tap unavailable (continuing with toggle):', e && e.message);
      return false;
    }
  };
  tryStartNativeTap();
  registerVoiceShortcut();
  app.on('browser-window-focus', unregisterFallbackShortcut);
  app.on('browser-window-blur', registerVoiceShortcut);

  const inputMatchesCombo = (input) => {
    const k = combo.key;
    const keyHit = k.length === 1
      ? (input.code === `Key${k.toUpperCase()}` || (input.key || '').toLowerCase() === k.toLowerCase())
      : (input.code === k || input.key === k);
    return keyHit &&
      (!combo.mods.meta || input.meta) &&
      (!combo.mods.ctrl || input.control) &&
      (!combo.mods.alt || input.alt) &&
      (!combo.mods.shift || input.shift);
  };

  const installVoiceHoldRelay = (contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      if (inputMatchesCombo(input)) {
        if (!tapProven) sendFallbackToggle();
        event.preventDefault();
      }
    });
  };
  // Installed via web-contents-created: the main window is born later in the whenReady sequence, and
  // webview guests swallow keys when a page has focus, so every window/guest gets the relay.
  app.on('web-contents-created', (event, contents) => {
    const t = contents.getType();
    if (t === 'window' || t === 'webview') installVoiceHoldRelay(contents);
  });

  // Renderer pushes the user's saved combo on boot and whenever Settings changes it.
  ipcMain.on('voice:set-hotkey', (_e, comboStr) => {
    const next = parseCombo(comboStr);
    if (next.accel === combo.accel) return;
    combo = next;
    if (UiohookKeyRef) tapKeycode = uiohookKeycodeFor(combo.key, UiohookKeyRef);
    unregisterFallbackShortcut();
    registerVoiceShortcut();
    console.log('[voice] hotkey set to', combo.accel);
  });

  ipcMain.handle('voice:hold-capable', () => tapProven);
  // Settings' "Hold to talk" fires the Accessibility prompt; Input Monitoring has no Electron API,
  // but a running tap makes macOS list the app in that pane for the user to flip.
  ipcMain.handle('voice:request-hold-permission', () => {
    if (process.platform === 'darwin' && !tapProven) {
      try { systemPreferences.isTrustedAccessibilityClient(true); } catch (_) {}
    }
    return tapProven;
  });
}

module.exports = { installVoiceHotkey };
