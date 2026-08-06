import { VOICE_CUE_START, VOICE_CUE_STOP } from './voiceCueSounds';

// Eric picked these from Google's Material product sound set after a bake-off against Wispr Flow's
// real cues; the synth versions never survived an ear test. Files are embedded data URIs (see
// voiceCueSounds.ts), pre-instantiated so playback is instant on the press.

const CUE_VOLUME = 0.35;

const p_players: Record<'start' | 'stop', HTMLAudioElement | null> = { start: null, stop: null };

function player(kind: 'start' | 'stop'): HTMLAudioElement {
  let a = p_players[kind];
  if (!a) {
    a = new Audio(kind === 'start' ? VOICE_CUE_START : VOICE_CUE_STOP);
    a.volume = CUE_VOLUME;
    p_players[kind] = a;
  }
  return a;
}

export function playVoiceCue(kind: 'start' | 'stop'): void {
  try {
    const a = player(kind);
    a.currentTime = 0;
    void a.play();
  } catch { /* a missing audio device must never break dictation */ }
}
