import React, { useCallback, useEffect, useRef } from 'react';
import { useAppSelector } from '@/shared/hooks';
import { useVoiceDictation } from './useVoiceDictation';
import { VoiceContext } from './voiceContext';
import VoiceOverlay from './VoiceOverlay';

// One recorder for the whole app. Both mics (the Help pill and the spawn composer) plus the global
// hotkey drive the SAME dictation session, so two mics can't fight over the microphone or show
// out-of-sync state. Mounted once near the app root.

export function VoiceDictationProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { state, lastText, error, pct, feedback, toggle, start, stop, volumeRef } = useVoiceDictation();
  const holdMode = useAppSelector((s) => s.settings.data.voice_hold_to_talk ?? true);
  const dictationShortcut = useAppSelector((s) => s.settings.data.dictation_shortcut ?? null);

  // Push the user's combo to main on boot and on change so every hotkey tier rebinds live.
  useEffect(() => {
    const bridge = window as unknown as { openswarm?: { setVoiceHotkey?: (combo: string | null) => void } };
    bridge.openswarm?.setVoiceHotkey?.(dictationShortcut);
  }, [dictationShortcut]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const heldRef = useRef(false);

  const pressStart = useCallback((): void => {
    if (holdMode) {
      // A TAP while recording must stop: the quick tap's press-end fires before the async start
      // flips state to 'recording', so without this the mic could be started by a click but never
      // stopped by one.
      if (stateRef.current === 'recording') { heldRef.current = false; void stop(); return; }
      if (stateRef.current === 'idle') { heldRef.current = true; void start(); }
    } else {
      toggle();
    }
  }, [holdMode, start, stop, toggle]);

  const pressEnd = useCallback((): void => {
    if (holdMode && heldRef.current) {
      heldRef.current = false;
      if (stateRef.current === 'recording') void stop();
    }
  }, [holdMode, stop]);

  // Keyboard hotkey channels, matched to what the source can actually see:
  // voice:hold-down/up come ONLY from main's native uiohook tap (real global key-up, so the keyboard
  // gets the same hold-vs-toggle press semantics as the mic buttons); voice:toggle comes from the
  // fallback tier (globalShortcut / before-input relay), where key-ups are undetectable, so each
  // press toggles. Whichever tier main activated, the renderer just honors the channel it hears.
  useEffect(() => {
    const bridge = window as unknown as {
      openswarm?: { onVoiceHold?: (d: () => void, u: () => void) => () => void };
    };
    const offHold = bridge.openswarm?.onVoiceHold?.(pressStart, pressEnd);
    return () => { offHold?.(); };
  }, [pressStart, pressEnd]);

  return (
    <VoiceContext.Provider value={{ state, lastText, error, pct, feedback, toggle, pressStart, pressEnd, holdMode, volumeRef }}>
      {children}
      <VoiceOverlay />
    </VoiceContext.Provider>
  );
}
