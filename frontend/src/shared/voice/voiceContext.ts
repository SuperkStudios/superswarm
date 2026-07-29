import React, { createContext, useContext } from 'react';
import { VoiceState, VoiceFeedback } from './useVoiceDictation';

// The context lives below both the provider and the overlay so neither imports the other
// (VoiceDictationContext renders VoiceOverlay; both reach down here instead of sideways).
export interface VoiceContextValue {
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

export const VoiceContext = createContext<VoiceContextValue>(NOOP);

// A component rendered outside the provider (or a web build with no Electron bridge) gets the no-op,
// so mics still render and just do nothing rather than crashing.
export function useVoice(): VoiceContextValue {
  return useContext(VoiceContext);
}
