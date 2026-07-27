const { app, globalShortcut, ipcMain, systemPreferences } = require('electron');

// Voice dictation hotkey (F5 primary, Cmd/Ctrl+Shift+D backup), two tiers:
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

const VOICE_COMBOS = ['F5', 'CommandOrControl+Shift+D'];
const TAP_FRESH_MS = 200;
const FALLBACK_DEFER_MS = 90;

function installVoiceHotkey(getMainWindow) {
  const send = (channel) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel);
  };

  let tapProven = false;
  let lastTapKeyMs = 0;

  const unregisterFallbackShortcuts = () => {
    for (const combo of VOICE_COMBOS) { try { globalShortcut.unregister(combo); } catch (_) {} }
  };

  // Fallback toggle, deferred so a live tap's hold-down wins the same press.
  const sendFallbackToggle = () => {
    setTimeout(() => {
      if (Date.now() - lastTapKeyMs < TAP_FRESH_MS) return;
      send('voice:toggle');
    }, FALLBACK_DEFER_MS);
  };

  const tryStartNativeTap = () => {
    try {
      if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
        console.log('[voice] no Accessibility grant, keyboard stays press-to-toggle');
        return false;
      }
      const { uIOhook, UiohookKey } = require('uiohook-napi');
      const MOD_KEYS = new Set([
        UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Shift, UiohookKey.ShiftRight,
        UiohookKey.Meta, UiohookKey.MetaRight,
      ]);
      // 'f5' | 'combo' | null; one hold at a time, repeats and the other combo ignored while held.
      let heldBy = null;

      const markAlive = () => {
        lastTapKeyMs = Date.now();
        if (!tapProven) {
          tapProven = true;
          unregisterFallbackShortcuts();
          console.log('[voice] native key tap PROVEN (events flowing), hold-to-talk enabled');
        }
      };

      uIOhook.on('keydown', (e) => {
        markAlive();
        if (heldBy) return;
        if (e.keycode === UiohookKey.F5) {
          heldBy = 'f5';
          send('voice:hold-down');
        } else if (e.keycode === UiohookKey.D && e.shiftKey && (e.metaKey || e.ctrlKey)) {
          heldBy = 'combo';
          send('voice:hold-down');
        }
      });
      uIOhook.on('keyup', (e) => {
        markAlive();
        if (!heldBy) return;
        const releases =
          (heldBy === 'f5' && e.keycode === UiohookKey.F5) ||
          (heldBy === 'combo' && (e.keycode === UiohookKey.D || MOD_KEYS.has(e.keycode)));
        if (releases) {
          heldBy = null;
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

  // Fallback shortcuts stay registered while unfocused until the tap proves alive.
  const registerVoiceShortcut = () => {
    if (tapProven) return;
    for (const combo of VOICE_COMBOS) {
      try {
        if (!globalShortcut.isRegistered(combo)) {
          globalShortcut.register(combo, sendFallbackToggle);
        }
      } catch (_) { /* a taken shortcut just means no global hotkey; the pill still works */ }
    }
  };
  registerVoiceShortcut();
  app.on('browser-window-focus', unregisterFallbackShortcuts);
  app.on('browser-window-blur', registerVoiceShortcut);

  const installVoiceHoldRelay = (contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      const isD = (input.code === 'KeyD' || (input.key || '').toLowerCase() === 'd');
      const combo = (isD && (input.meta || input.control) && input.shift) || input.code === 'F5';
      if (combo) {
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
