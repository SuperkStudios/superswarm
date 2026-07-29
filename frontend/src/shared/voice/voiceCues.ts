// WhisperFlow-grade start/stop chimes, synthesized in WebAudio so they ship weightless and always
// match: a soft two-note rise on start ("I'm listening"), the mirrored fall on stop. Sine + gentle
// lowpass + fast attack / exponential release = crisp but soothing, never a system beep.

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(ac: AudioContext, freq: number, at: number, dur: number, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0004, at + dur);
  osc.connect(lp);
  lp.connect(gain);
  gain.connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function playVoiceCue(kind: 'start' | 'stop'): void {
  const ac = ensureCtx();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  if (kind === 'start') {
    blip(ac, 587, t, 0.16, 0.055);
    blip(ac, 880, t + 0.085, 0.2, 0.05);
  } else {
    blip(ac, 880, t, 0.14, 0.045);
    blip(ac, 587, t + 0.075, 0.22, 0.05);
  }
}
