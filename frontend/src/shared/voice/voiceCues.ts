// WhisperFlow-grade start/stop cues, synthesized in WebAudio so they ship weightless and always
// match. Not a chime: a soft percussive "pop" (tiny click transient + falling tone), like a water
// drop. Start pops slightly higher than stop, so the pair reads as press/release, not as an alarm.

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

// The transient: 6ms of bandpassed noise gives the pop its tactile "tick" edge.
function tick(ac: AudioContext, at: number, freq: number, peak: number): void {
  const len = Math.floor(ac.sampleRate * 0.006);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.2;
  const gain = ac.createGain();
  gain.gain.value = peak;
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ac.destination);
  src.start(at);
}

// The body: a sine gliding down fast with an exponential decay reads as a "plop", not a beep.
function pop(ac: AudioContext, at: number, from: number, to: number, dur: number, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur * 0.7);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.006);
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
    tick(ac, t, 2200, 0.05);
    pop(ac, t, 760, 520, 0.11, 0.06);
  } else {
    tick(ac, t, 1600, 0.04);
    pop(ac, t, 520, 360, 0.13, 0.055);
  }
}
