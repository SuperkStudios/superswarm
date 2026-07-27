const { app, globalShortcut, ipcMain, systemPreferences } = require('electron');

// Voice dictation hotkey (F5 primary, Cmd/Ctrl+Shift+D backup), two tiers:
//
//   NATIVE (uiohook-napi event tap): sees real key-down AND key-up globally, in or out of focus,
//   immune to macOS's letter-keyup-under-Cmd suppression, so the keyboard gets TRUE hold-to-talk
//   exactly like the mic buttons. Listen-only (never swallows keys from other apps). macOS needs
//   the Accessibility grant; Windows needs nothing.
//
//   FALLBACK (no native tap: module missing, load failure, or no macOS permission): the pre-tap
//   behavior verbatim. globalShortcut toggles while our window is unfocused; a before-input relay
//   toggles while focused (key-ups are undetectable there, proven empirically, so press-to-toggle).
//
// The before-input relay installs in BOTH tiers: with the tap active it only swallows the combo so
// pages/webviews never see F5 or the 'd', with the tap inactive it also sends the toggle.

const VOICE_COMBOS = ['F5', 'CommandOrControl+Shift+D'];

function installVoiceHotkey(getMainWindow) {
  const send = (channel) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel);
  };

  let nativeTapActive = false;

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

      uIOhook.on('keydown', (e) => {
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
      console.log('[voice] native key tap active, keyboard hold-to-talk enabled');
      return true;
    } catch (e) {
      console.log('[voice] native key tap unavailable (continuing with toggle):', e && e.message);
      return false;
    }
  };
  nativeTapActive = tryStartNativeTap();

  if (!nativeTapActive) {
    const registerVoiceShortcut = () => {
      for (const combo of VOICE_COMBOS) {
        try {
          if (!globalShortcut.isRegistered(combo)) {
            globalShortcut.register(combo, () => send('voice:toggle'));
          }
        } catch (_) { /* a taken shortcut just means no global hotkey; the pill still works */ }
      }
    };
    registerVoiceShortcut();
    app.on('browser-window-focus', () => { for (const combo of VOICE_COMBOS) { try { globalShortcut.unregister(combo); } catch (_) {} } });
    app.on('browser-window-blur', registerVoiceShortcut);
  }

  const installVoiceHoldRelay = (contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      const isD = (input.code === 'KeyD' || (input.key || '').toLowerCase() === 'd');
      const combo = (isD && (input.meta || input.control) && input.shift) || input.code === 'F5';
      if (combo) {
        if (!nativeTapActive) send('voice:toggle');
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

  ipcMain.handle('voice:hold-capable', () => nativeTapActive);
  // Settings' "Hold to talk" can trigger the real macOS Accessibility prompt; a restart picks it up.
  ipcMain.handle('voice:request-hold-permission', () => {
    if (process.platform === 'darwin' && !nativeTapActive) {
      try { systemPreferences.isTrustedAccessibilityClient(true); } catch (_) {}
    }
    return nativeTapActive;
  });
}

module.exports = { installVoiceHotkey };
