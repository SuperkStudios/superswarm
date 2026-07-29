import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import MicIcon from '@mui/icons-material/Mic';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useThemeAccent } from '@/shared/styles/ThemeContext';
import { useVoice } from './voiceContext';

// WhisperFlow-style presence: while the mic is hot, an aurora breathes up from the bottom edge in
// the COMPLEMENT of the user's accent (opposite hue = always visible against their canvas, never
// camouflaged by it), as a three-hue gradient whose lobes morph with the live mic level. Imperative
// rAF writes only (opacity + transform), so 60Hz voice never re-renders React.

function hexToHue(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 250, s: 70, l: 60 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s: sat * 100, l: l * 100 };
}

// Interleaved wisps, like colored gases: neighbors always carry a DIFFERENT hue and overlap ~70%,
// so mixture happens everywhere instead of three tinted patches sitting in a row.
const LOBES = [
  { left: '18%', width: '80vw', height: 200, drift: 0.9, phase: 0.0, hue: 0 },
  { left: '34%', width: '95vw', height: 165, drift: 0.65, phase: 2.1, hue: 2 },
  { left: '47%', width: '85vw', height: 210, drift: 1.1, phase: 4.2, hue: 1 },
  { left: '60%', width: '100vw', height: 170, drift: 0.8, phase: 1.3, hue: 0 },
  { left: '73%', width: '85vw', height: 205, drift: 1.2, phase: 3.4, hue: 2 },
  { left: '88%', width: '78vw', height: 175, drift: 0.7, phase: 5.1, hue: 1 },
];

const VoiceAurora: React.FC<{ volumeRef: React.MutableRefObject<number> }> = ({ volumeRef }) => {
  const { accent } = useThemeAccent();
  const lobeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const smooth = useRef<number[]>([0, 0, 0]);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const tick = (): void => {
      const v = Math.min(1, volumeRef.current);
      const t = performance.now() / 1000;
      LOBES.forEach((lobe, i) => {
        const el = lobeRefs.current[i];
        if (!el) return;
        // Lerp toward the live level so the shape glides instead of jittering; a slow sinusoid keeps
        // it undulating at steady volume, and volume swells both the wave and the lobe height.
        smooth.current[i] += (v - smooth.current[i]) * 0.16;
        const sv = smooth.current[i];
        const wave = reduced ? 0 : Math.sin(t * lobe.drift + lobe.phase) * (0.08 + sv * 0.1);
        el.style.opacity = String(0.3 + sv * 0.6);
        el.style.transform = `translateX(-50%) scale(${1 + wave * 0.6}, ${0.45 + sv * 1.25 + wave})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [volumeRef]);

  // Opposite side of the wheel from the chosen accent, with two flanking hues for a real gradient.
  const { h } = hexToHue(accent || '#6b62f0');
  // Wide, softly randomized spread around the complement: three tight neon bands read segmented
  // (the red/orange/yellow stripe complaint); jittered hues + lower saturation blend like a real
  // aurora while staying distinguishable. Jitter is per-mount so each dictation feels alive.
  const jitter = React.useMemo(() => [Math.random() * 16 - 8, Math.random() * 12 - 6, Math.random() * 16 - 8], []);
  const c0 = `hsl(${(h + 158 + jitter[0] + 360) % 360} 68% 63%)`;
  const c1 = `hsl(${(h + 180 + jitter[1]) % 360} 72% 60%)`;
  const c2 = `hsl(${(h + 202 + jitter[2]) % 360} 68% 65%)`;
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 170, zIndex: 2147482999, pointerEvents: 'none', overflow: 'visible' }}>
      {LOBES.map((lobe, i) => {
        const col = [c0, c1, c2][lobe.hue];
        return (
          <div
            key={i}
            ref={(el) => { lobeRefs.current[i] = el; }}
            style={{
              position: 'absolute', bottom: -40, left: lobe.left, width: lobe.width, height: lobe.height,
              transform: 'translateX(-50%) scale(1, 0.45)', transformOrigin: 'bottom center',
              background: `radial-gradient(ellipse at 50% 100%, ${col} 0%, ${col}00 70%)`,
              filter: 'blur(52px)', opacity: 0.17, willChange: 'transform, opacity',
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 90,
          background: `linear-gradient(to right, ${c1}33, ${c1}55, ${c1}33)`,
          maskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)',
          filter: 'blur(10px)',
        }}
      />
    </div>
  );
};

// WhisperFlow's signature: a small capsule drops from the TOP edge while the mic is hot, carrying a
// live waveform. Canvas bars driven straight off the mic level ring buffer, imperative rAF only.
const BAR_COUNT = 26;

const VoiceTab: React.FC<{ volumeRef: React.MutableRefObject<number> }> = ({ volumeRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<number[]>(new Array(BAR_COUNT).fill(0.06));
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const draw = (): void => {
      const canvas = canvasRef.current;
      if (canvas) {
        const g = canvas.getContext('2d');
        if (g) {
          // Shift one bar every other frame so the wave scrolls readably at 60Hz input.
          frame += 1;
          if (frame % 2 === 0) {
            history.current.push(Math.min(1, 0.08 + volumeRef.current * 1.6));
            history.current.shift();
          }
          const w = canvas.width;
          const h = canvas.height;
          g.clearRect(0, 0, w, h);
          const bw = w / BAR_COUNT;
          for (let i = 0; i < BAR_COUNT; i++) {
            const level = history.current[i];
            const bh = Math.max(3, level * (h - 4));
            const x = i * bw + bw * 0.25;
            g.fillStyle = `rgba(255,255,255,${0.35 + level * 0.6})`;
            const bwid = bw * 0.5;
            const y = (h - bh) / 2;
            g.beginPath();
            g.roundRect(x, y, bwid, bh, bwid / 2);
            g.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [volumeRef]);
  return (
    <Box
      sx={{
        position: 'fixed', top: 10, left: '50%', zIndex: 2147483001, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderRadius: 999,
        background: 'rgba(18,12,26,0.88)',
        backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        '@keyframes vtab-in': { from: { opacity: 0, transform: 'translate(-50%, -14px)' }, to: { opacity: 1, transform: 'translate(-50%, 0)' } },
        animation: 'vtab-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      <MicIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.75)' }} />
      <canvas ref={canvasRef} width={132} height={22} style={{ display: 'block', width: 132, height: 22 }} />
    </Box>
  );
};

// The whole point: dictation must never look like "nothing happened." This floats a small status
// card above the composer for every phase (listening, transcribing, downloading the model) and shows
// the transcript + whether it was pasted or just copied. Non-interactive, auto-dismisses.
const FEEDBACK_MS = 4500;

function feedbackIcon(icon: string): React.ReactElement {
  if (icon === 'check') return <CheckRoundedIcon sx={{ fontSize: 16, color: '#4ade80' }} />;
  if (icon === 'clipboard') return <ContentPasteRoundedIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }} />;
  if (icon === 'mic') return <MicIcon sx={{ fontSize: 16, color: '#ff8a8a' }} />;
  return <InfoOutlinedIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }} />;
}

const VoiceOverlay: React.FC = () => {
  const { state, pct, feedback, volumeRef } = useVoice();
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (!feedback) return undefined;
    setShowFeedback(true);
    const t = setTimeout(() => setShowFeedback(false), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [feedback]);

  const live = state !== 'idle';
  const visible = live || (showFeedback && !!feedback);
  if (!visible) return null;
  const aurora = state === 'recording' ? (
    <>
      <VoiceAurora volumeRef={volumeRef} />
      <VoiceTab volumeRef={volumeRef} />
    </>
  ) : null;

  let content: React.ReactElement | null;
  if (state === 'recording') {
    // The aurora IS the listening indicator; a pill on top of it read as clutter.
    content = null;
  } else if (state === 'transcribing') {
    content = (<><CircularProgress size={13} thickness={5} sx={{ color: 'rgba(255,255,255,0.7)' }} /><span>Transcribing</span></>);
  } else if (state === 'preparing') {
    content = (<><CircularProgress size={13} thickness={5} sx={{ color: 'rgba(255,255,255,0.7)' }} /><span>Downloading voice model {pct}%</span></>);
  } else if (feedback) {
    content = (
      <>
        {feedbackIcon(feedback.icon)}
        <Box component="span" sx={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {feedback.text}
        </Box>
      </>
    );
  } else {
    return null;
  }

  return (
    <>
    {aurora}
    {content && (
    <Box
      sx={{
        position: 'fixed',
        bottom: 84,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.75,
        py: 0.9,
        maxWidth: '80vw',
        borderRadius: 999,
        background: 'rgba(22,12,34,0.9)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        color: 'rgba(255,255,255,0.92)',
        fontSize: '0.8125rem',
        fontWeight: 500,
        '@keyframes vin': { from: { opacity: 0, transform: 'translate(-50%, 6px)' }, to: { opacity: 1, transform: 'translate(-50%, 0)' } },
        animation: 'vin 0.16s ease-out',
      }}
    >
      {content}
    </Box>
    )}
    </>
  );
};

export default VoiceOverlay;
