import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import MicIcon from '@mui/icons-material/Mic';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useVoice } from './voiceContext';

// WhisperFlow's recording grammar, and nothing else: one small capsule at bottom center holding
// cancel (X), a live waveform, and confirm (check). No aurora, no full-screen dressing; the capsule
// IS the "mic is hot" signal. Canvas bars are driven imperatively off the mic-level ref so 60Hz
// audio never re-renders React.
const BAR_COUNT = 18;

const Waveform: React.FC<{ volumeRef: React.MutableRefObject<number> }> = ({ volumeRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<number[]>(new Array(BAR_COUNT).fill(0.05));
  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      const canvas = canvasRef.current;
      if (canvas) {
        const g = canvas.getContext('2d');
        if (g) {
          // Every frame, with a perceptual curve: speech snaps the bars up the way Wispr's do.
          history.current.push(Math.min(1, Math.pow(volumeRef.current * 2.1, 0.75)));
          history.current.shift();
          const w = canvas.width;
          const h = canvas.height;
          g.clearRect(0, 0, w, h);
          const bw = w / BAR_COUNT;
          for (let i = 0; i < BAR_COUNT; i++) {
            const level = Math.max(0.08, history.current[i]);
            const bh = Math.max(2, level * (h - 2));
            const x = i * bw + bw * 0.3;
            g.fillStyle = `rgba(255,255,255,${0.35 + level * 0.6})`;
            const bwid = bw * 0.4;
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
  return <canvas ref={canvasRef} width={88} height={16} style={{ display: 'block', width: 88, height: 16 }} />;
};

const VoiceCapsule: React.FC<{
  transcribing: boolean;
  volumeRef: React.MutableRefObject<number>;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ transcribing, volumeRef, onCancel, onConfirm }) => (
  <Box
    // Buttons must never steal focus: a mousedown that moved focus here would redirect the
    // transcript away from the field the user is dictating into.
    onMouseDown={(e) => e.preventDefault()}
    sx={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2147483001,
      display: 'flex', alignItems: 'center', gap: 0.75, pl: 0.5, pr: 0.5, py: 0.4, borderRadius: 999,
      background: 'rgba(18,16,24,0.92)',
      backdropFilter: 'blur(18px) saturate(150%)', WebkitBackdropFilter: 'blur(18px) saturate(150%)',
      boxShadow: '0 10px 32px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07)',
      '@keyframes vcap-in': { from: { opacity: 0, transform: 'translate(-50%, 10px) scale(0.96)' }, to: { opacity: 1, transform: 'translate(-50%, 0) scale(1)' } },
      animation: 'vcap-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both',
    }}
  >
    <IconButton
      size="small"
      aria-label="Cancel dictation"
      onClick={onCancel}
      disabled={transcribing}
      sx={{ width: 26, height: 26, color: 'rgba(255,255,255,0.75)', bgcolor: 'rgba(255,255,255,0.09)', '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' } }}
    >
      <CloseRoundedIcon sx={{ fontSize: 14 }} />
    </IconButton>
    <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center', minWidth: 88, justifyContent: 'center' }}>
      {transcribing
        ? <CircularProgress size={13} thickness={5} sx={{ color: 'rgba(255,255,255,0.7)' }} />
        : <Waveform volumeRef={volumeRef} />}
    </Box>
    <IconButton
      size="small"
      aria-label="Finish dictation"
      onClick={onConfirm}
      disabled={transcribing}
      sx={{ width: 26, height: 26, color: '#17141d', bgcolor: 'rgba(255,255,255,0.95)', '&:hover': { bgcolor: '#ffffff' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.4)', color: '#17141d' } }}
    >
      <CheckRoundedIcon sx={{ fontSize: 15 }} />
    </IconButton>
  </Box>
);

// The floating status card above the capsule: live transcript while speaking, download progress,
// and terminal feedback (clipboard fallback, errors). Non-interactive, auto-dismisses.
const FEEDBACK_MS = 4500;

function feedbackIcon(icon: string): React.ReactElement {
  if (icon === 'check') return <CheckRoundedIcon sx={{ fontSize: 16, color: '#4ade80' }} />;
  if (icon === 'clipboard') return <ContentPasteRoundedIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }} />;
  if (icon === 'mic') return <MicIcon sx={{ fontSize: 16, color: '#ff8a8a' }} />;
  return <InfoOutlinedIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.8)' }} />;
}

// Live transcript preview: committed phrases solid, the in-flight hypothesis dimmed. Tail-clamped
// so the newest words are always the visible ones (openwhispr's preview overlay behavior).
const PREVIEW_TAIL_CHARS = 220;

const LiveTranscript: React.FC<{ committed: string; tentative: string }> = ({ committed, tentative }) => {
  const total = committed.length + tentative.length;
  const over = total - PREVIEW_TAIL_CHARS;
  const shownCommitted = over > 0 ? `…${committed.slice(Math.min(over, committed.length))}` : committed;
  return (
    <Box component="span" sx={{ maxWidth: 560, lineHeight: 1.45, whiteSpace: 'normal' }}>
      <Box component="span">{shownCommitted}</Box>
      {tentative && (
        <Box component="span" sx={{ opacity: 0.55 }}>{shownCommitted ? ' ' : ''}{tentative}</Box>
      )}
    </Box>
  );
};

const VoiceOverlay: React.FC = () => {
  const { state, pct, feedback, partial, volumeRef, confirmRecording, cancelRecording } = useVoice();
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

  const capsule = (state === 'recording' || state === 'transcribing') ? (
    <VoiceCapsule transcribing={state === 'transcribing'} volumeRef={volumeRef} onCancel={cancelRecording} onConfirm={confirmRecording} />
  ) : null;

  const hasPartial = !!partial && !!(partial.committed || partial.tentative);
  let content: React.ReactElement | null;
  if (state === 'recording' || state === 'transcribing') {
    // The capsule says "listening"; the card appears only once there are live words to show.
    content = hasPartial ? <LiveTranscript committed={partial.committed} tentative={partial.tentative} /> : null;
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
    content = null;
  }

  return (
    <>
    {capsule}
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
