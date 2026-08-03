import React, { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import SendIcon from '@mui/icons-material/Send';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import StopIcon from '@mui/icons-material/Stop';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { AgentSession, AgentMessage, stopAgent, handleApproval } from '@/shared/state/agentsSlice';
import { useStreamingMessage } from '@/shared/state/streamingSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';

interface Props {
  session: AgentSession;
  browserWidth: number;
  browserHeight: number;
}

// Same red as this card's own error icon, so a failed step and a failed run read as one thing.
const P_FAILED_COLOR = '#f87171';

interface LogEntry {
  type: 'thought' | 'action' | 'result' | 'skip';
  text: string;
  /** Wall-clock of the message, so a stalled run shows WHERE it stalled. */
  at?: string;
  /** Only on a result: did the tool that just ran actually work? */
  ok?: boolean;
}

function summarizeMessage(msg: AgentMessage): LogEntry {
  if (msg.role === 'assistant' && typeof msg.content === 'string') {
    const trimmed = msg.content.trim();
    if (!trimmed) return { type: 'skip', text: '' };
    return { type: 'thought', text: trimmed, at: msg.timestamp };
  }

  if (msg.role === 'tool_call') {
    const content = typeof msg.content === 'string' ? (() => { try { return JSON.parse(msg.content); } catch { return {}; } })() : msg.content;
    const tool = content?.tool || content?.name || '?';
    const input = content?.input || {};
    let brief = '';
    switch (tool) {
      case 'BrowserNavigate': brief = `Navigate → ${input.url || '...'}`; break;
      case 'BrowserClick': brief = `Click ${input.selector || '...'}`; break;
      case 'BrowserType': brief = `Type "${(input.text || '').slice(0, 30)}${(input.text || '').length > 30 ? '…' : ''}" into ${input.selector || '...'}`; break;
      case 'BrowserScreenshot': brief = 'Screenshot'; break;
      case 'BrowserGetText': brief = 'Read page text'; break;
      case 'BrowserGetElements': brief = `Inspect elements${input.selector ? ` (${input.selector})` : ''}`; break;
      case 'BrowserEvaluate': brief = `Evaluate JS`; break;
      default: brief = tool;
    }
    return { type: 'action', text: brief, at: msg.timestamp };
  }

  if (msg.role === 'tool_result') {
    const content = typeof msg.content === 'string' ? (() => { try { return JSON.parse(msg.content); } catch { return {}; } })() : msg.content;
    // Older results predate the `ok` flag; absent means "no reason to think it failed", which keeps
    // a resumed session from repainting its whole history red.
    return { type: 'result', text: '', ok: content?.ok !== false };
  }

  return { type: 'skip', text: '' };
}

const BrowserAgentOverlay: React.FC<Props> = ({ session, browserWidth, browserHeight }) => {
  const c = useClaudeTokens();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showSkipInput, setShowSkipInput] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parent session may send another BrowserAgent call; treat overlay as done only when both sub-task and parent are terminal.
  const parentStatus = useAppSelector((state) => {
    if (!session.parent_session_id) return null;
    return state.agents.sessions[session.parent_session_id]?.status ?? null;
  });
  const parentStillActive = parentStatus === 'running' || parentStatus === 'waiting_approval';

  const isRunning = session.status === 'running' || session.status === 'waiting_approval';
  const browserDone = session.status === 'completed' || session.status === 'error' || session.status === 'stopped';
  const streamingMessage = useStreamingMessage(session.id);
  // Only fade+hide when parent is finished too; otherwise show a "waiting" state between sub-tasks.
  const isDone = browserDone && !parentStillActive;

  const intervention = session.pending_approvals?.find(
    (a) => a.tool_name === 'RequestHumanIntervention',
  );
  const interventionProblem = (intervention?.tool_input as any)?.problem || 'The browser agent needs your help.';
  const interventionInstruction = (intervention?.tool_input as any)?.instruction || '';

  const prevSessionId = useRef(session.id);
  useEffect(() => {
    if (session.id !== prevSessionId.current) {
      prevSessionId.current = session.id;
      setFadeOut(false);
      setHidden(false);
      setConfirmStop(false);
      setShowSkipInput(false);
      setSkipReason('');
    }
  }, [session.id]);

  useEffect(() => {
    if (!intervention) {
      setShowSkipInput(false);
      setSkipReason('');
    }
  }, [intervention]);

  useEffect(() => {
    if (isDone) {
      fadeTimer.current = setTimeout(() => setFadeOut(true), 2000);
    }
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  }, [isDone]);

  useEffect(() => {
    if (fadeOut) {
      hideTimer.current = setTimeout(() => setHidden(true), 400);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [fadeOut]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages.length, streamingMessage]);

  const handleStop = useCallback(() => {
    if (!confirmStop) {
      setConfirmStop(true);
      confirmTimer.current = setTimeout(() => setConfirmStop(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmStop(false);
    dispatch(stopAgent({ sessionId: session.id }));
  }, [confirmStop, dispatch, session.id]);

  useEffect(() => {
    return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); };
  }, []);

  const accentColor = c.accent.primary;

  // A result carries no text of its own; its job is to say whether the action just above it
  // worked. Fold it back onto that action so a failed click reads as failed instead of vanishing,
  // which is what happened before: the overlay dropped results entirely and drew every action the
  // same whether it succeeded or errored.
  const entries: LogEntry[] = [];
  for (const e of session.messages.map(summarizeMessage)) {
    if (e.type === 'skip') continue;
    if (e.type === 'result') {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === 'action') {
          if (e.ok === false) entries[i] = { ...entries[i], ok: false };
          break;
        }
      }
      continue;
    }
    entries.push(e);
  }

  if (streamingMessage && streamingMessage.role === 'assistant' && streamingMessage.content) {
    entries.push({ type: 'thought', text: streamingMessage.content });
  }

  const collapsedW = Math.min(300, browserWidth - 24);
  const collapsedH = Math.min(200, browserHeight - 24);
  const expandedW = Math.min(Math.floor(browserWidth * 0.55), browserWidth - 24);
  const expandedH = Math.min(Math.floor(browserHeight * 0.6), browserHeight - 24);

  const panelW = intervention ? Math.min(340, browserWidth - 24) : expanded ? expandedW : collapsedW;
  // Intervention auto-sizes to fit content; fixed height would clip the Done button.
  const panelH = intervention ? undefined : expanded ? expandedH : collapsedH;

  if (hidden) return null;

  return (
    <Box
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: panelW,
        ...(panelH != null ? { height: panelH } : { maxHeight: Math.min(320, browserHeight - 24) }),
        zIndex: 18,
        borderRadius: '12px',
        bgcolor: 'rgba(15, 15, 15, 0.88)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${intervention ? 'rgba(245,158,11,0.4)' : `${accentColor}30`}`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.25s ease, height 0.25s ease, opacity 0.4s ease',
        opacity: fadeOut ? 0 : isDone ? 0.7 : 1,
        animation: 'overlay-enter 0.3s ease-out',
        '@keyframes overlay-enter': {
          '0%': { opacity: 0, transform: 'translateY(8px) scale(0.95)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.75,
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
          flexShrink: 0,
        }}
      >
        {intervention
          ? <PanToolOutlinedIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
          : <SmartToyOutlinedIcon sx={{ fontSize: 14, color: accentColor }} />
        }

        {(isRunning || (browserDone && parentStillActive)) && !intervention && (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: accentColor,
              flexShrink: 0,
              animation: 'overlay-dot-pulse 1.4s ease-in-out infinite',
              '@keyframes overlay-dot-pulse': {
                '0%, 100%': { opacity: 0.4, transform: 'scale(0.8)' },
                '50%': { opacity: 1, transform: 'scale(1.3)' },
              },
            }}
          />
        )}

        {isDone && session.status === 'completed' && (
          <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#4ade80' }} />
        )}
        {isDone && session.status === 'error' && (
          <ErrorOutlineIcon sx={{ fontSize: 14, color: '#f87171' }} />
        )}

        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: intervention ? '#f59e0b' : 'rgba(255,255,255,0.85)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isDone
            ? session.status === 'completed' ? 'Done' : session.status === 'error' ? 'Error' : 'Stopped'
            : intervention ? 'Needs Help'
            : browserDone && parentStillActive ? 'Waiting…'
            : 'Browser Agent'}
        </Typography>

        <Tooltip title={expanded ? 'Collapse' : 'Expand'} placement="top">
          <IconButton
            size="small"
            onClick={() => setExpanded((e) => !e)}
            sx={{
              color: 'rgba(255,255,255,0.5)',
              p: 0.3,
              '&:hover': { color: 'rgba(255,255,255,0.8)' },
            }}
          >
            {expanded
              ? <CloseFullscreenIcon sx={{ fontSize: 13 }} />
              : <OpenInFullIcon sx={{ fontSize: 13 }} />
            }
          </IconButton>
        </Tooltip>

        {isRunning && (
          <Tooltip title={confirmStop ? 'Click again to confirm' : 'Stop'} placement="top">
            <IconButton
              size="small"
              onClick={handleStop}
              sx={{
                p: 0.3,
                color: confirmStop ? '#f87171' : 'rgba(255,255,255,0.5)',
                bgcolor: confirmStop ? 'rgba(248,113,113,0.15)' : 'transparent',
                '&:hover': {
                  color: '#f87171',
                  bgcolor: 'rgba(248,113,113,0.12)',
                },
                transition: 'all 0.15s',
              }}
            >
              <StopIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Body: intervention prompt OR scrollable action log */}
      {intervention ? (
        <Box sx={{ flex: 1, px: 1.25, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* The run is stopped dead until somebody reads this, so it reads like a headline, not a footnote. The line that used to sit under it ("resolve it above, then click Done") was 10px at 30% opacity, the faintest thing on the card, and it only restated the amber button two rows down. */}
          <Typography sx={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.92)', fontWeight: 500, lineHeight: 1.45 }}>
            {interventionProblem}
          </Typography>
          {interventionInstruction && (
            <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.45 }}>
              {interventionInstruction}
            </Typography>
          )}
          {showSkipInput ? (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto', pt: 0.5, alignItems: 'center' }}>
              <InputBase
                autoFocus
                placeholder="Why? (optional)"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dispatch(handleApproval({ requestId: intervention.id, behavior: 'deny', message: skipReason || 'Skipped by user' }));
                  }
                  if (e.key === 'Escape') setShowSkipInput(false);
                }}
                sx={{
                  flex: 1,
                  fontSize: '0.6875rem',
                  color: 'rgba(255,255,255,0.8)',
                  bgcolor: 'rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  px: 1,
                  py: 0.3,
                  '& input::placeholder': { color: 'rgba(255,255,255,0.3)' },
                }}
              />
              <IconButton
                size="small"
                onClick={() => dispatch(handleApproval({ requestId: intervention.id, behavior: 'deny', message: skipReason || 'Skipped by user' }))}
                sx={{
                  p: 0.4,
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': { color: 'rgba(255,255,255,0.8)' },
                }}
              >
                <SendIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 'auto', pt: 0.5 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => dispatch(handleApproval({ requestId: intervention.id, behavior: 'allow' }))}
                sx={{
                  bgcolor: '#f59e0b',
                  '&:hover': { bgcolor: '#d97706' },
                  textTransform: 'none',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  px: 1.5,
                  py: 0.4,
                  color: '#000',
                }}
              >
                Done, continue
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowSkipInput(true)}
                sx={{
                  color: 'rgba(255,255,255,0.4)',
                  '&:hover': { color: 'rgba(255,255,255,0.7)' },
                  textTransform: 'none',
                  fontSize: '0.6875rem',
                  px: 1,
                  py: 0.4,
                  minWidth: 'auto',
                }}
              >
                Skip
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 1.25,
            py: 0.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.12) transparent',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 2,
            },
          }}
        >
          {entries.length === 0 && isRunning && (
            <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
              Starting...
            </Typography>
          )}

          {entries.map((entry, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', minWidth: 0 }}>
              {entry.type === 'thought' ? (
                <>
                  <Box
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      bgcolor: 'rgba(255,255,255,0.25)',
                      flexShrink: 0,
                      mt: '5px',
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'rgba(255,255,255,0.6)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: expanded ? 6 : 2,
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {entry.text}
                  </Typography>
                </>
              ) : (
                <>
                  <Box
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '1px',
                      bgcolor: entry.ok === false ? P_FAILED_COLOR : accentColor,
                      flexShrink: 0,
                      mt: '5px',
                      transform: 'rotate(45deg)',
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontFamily: c.font.mono,
                      color: entry.ok === false ? P_FAILED_COLOR : accentColor,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      // Collapsed stays one tidy line; expanded is where you go to actually READ a
                      // long selector or URL, so it wraps there instead of ellipsing forever.
                      ...(expanded
                        ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-all' }
                        : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                    }}
                  >
                    {entry.ok === false ? `${entry.text} — failed` : entry.text}
                  </Typography>
                </>
              )}
              {expanded && entry.at && (
                <Typography
                  sx={{
                    fontSize: '0.625rem',
                    fontFamily: c.font.mono,
                    color: 'rgba(255,255,255,0.28)',
                    flexShrink: 0,
                    ml: 'auto',
                    pl: 0.5,
                    mt: '4px',
                  }}
                >
                  {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(BrowserAgentOverlay);
