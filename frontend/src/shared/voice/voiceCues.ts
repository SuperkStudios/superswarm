import { VOICE_CUE_START, VOICE_CUE_STOP, VOICE_CUE_PASTE, VOICE_CUE_LOCK } from './voiceCueSounds';

// Eric picked these from Google's Material product sound set after a bake-off against Wispr Flow's
// real cues; the synth versions never survived an ear test. Files are embedded data URIs (see
// voiceCueSounds.ts), pre-instantiated so playback is instant on the press. The grammar mirrors
// Wispr's three-beat: tap in, tap out, and a rising completion the moment the text actually lands;
// lock marks a hands-free latch.

const CUE_VOLUME = 0.35;

type CueKind = 'start' | 'stop' | 'paste' | 'lock';

const SOURCES: Record<CueKind, string> = {
  start: VOICE_CUE_START,
  stop: VOICE_CUE_STOP,
  paste: VOICE_CUE_PASTE,
  lock: VOICE_CUE_LOCK,
};

const p_players: Partial<Record<CueKind, HTMLAudioElement>> = {};

function player(kind: CueKind): HTMLAudioElement {
  let a = p_players[kind];
  if (!a) {
    a = new Audio(SOURCES[kind]);
    a.volume = kind === 'paste' ? CUE_VOLUME * 0.8 : CUE_VOLUME;
    p_players[kind] = a;
  }
  return a;
}

export function playVoiceCue(kind: CueKind): void {
  try {
    const a = player(kind);
    a.currentTime = 0;
    void a.play();
  } catch { /* a missing audio device must never break dictation */ }
}
