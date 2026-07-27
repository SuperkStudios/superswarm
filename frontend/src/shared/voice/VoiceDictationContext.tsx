import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useAppSelector } from '@/shared/hooks';
import { useVoiceDictation, VoiceState, VoiceFeedback } from './useVoiceDictation';
import VoiceOverlay from './VoiceOverlay';

// One recorder for the whole app. Both mics (the Help pill and the spawn composer) plus the global
// hotkey drive the SAME dictation session, so two mics can't fight over the microphone or show
// out-of-sync state. Mounted once near the app root.
interface VoiceContextValue {
  state: VoiceState;
  lastText: string;
  error: string | null;
  pct: number;
  feedback: VoiceFeedback | null;
  toggle: () => void;
  // Mic-button press semantics that respect the hold/toggle setting: press starts (or toggles),
  // release stops only in hold mode. Buttons wire onPointerDown/Up to these and stay mode-agnostic.
  pressStart: () => void;
  pressEnd: () => void;
  holdMode: boolean;
  volumeRef: React.MutableRefObject<number>;
}

const NOOP_REF = { current: 0 };
const NOOP: VoiceContextValue = { state: 'idle', lastText: '', error: null, pct: 0, feedback: null, toggle: () => {}, pressStart: () => {}, pressEnd: () => {}, holdMode: true, volumeRef: NOOP_REF };
const VoiceContext = createContext<VoiceContextValue>(NOOP);

export function VoiceDictationProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { state, lastText, error, pct, feedback, toggle, start, stop, volumeRef } = useVoiceDictation();
  const holdMode = useAppSelector((s) => s.settings.data.voice_hold_to_talk ?? true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const heldRef = useRef(false);

  const pressStart = useCallback((): void => {
    if (holdMode) {
      if (stateRef.current === 'idle') { heldRef.current = true; void start(); }
    } else {
      toggle();
    }
  }, [holdMode, start, toggle]);

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

// A component rendered outside the provider (or a web build with no Electron bridge) gets the no-op,
// so mics still render and just do nothing rather than crashing.
export function useVoice(): VoiceContextValue {
  return useContext(VoiceContext);
}
