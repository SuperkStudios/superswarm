import React, { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Grow from '@mui/material/Grow';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CloseIcon from '@mui/icons-material/Close';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { setInstalling } from '@/shared/state/updateSlice';
import { useClaudeTokens, useThemeMode } from '@/shared/styles/ThemeContext';

const UPDATE_DISMISS_KEY = 'openswarm-update-dismissed';

// Chrome/Claude-style: the download already ran silently (autoDownload in main.js), so the only
// state worth pixels is "ready". One pill, top-right, above the frameless-window drag strip that
// used to swallow the old banner button's clicks.
const UpdateReadyPill: React.FC = () => {
  const c = useClaudeTokens();
  const { mode } = useThemeMode();
  const dispatch = useAppDispatch();
  const updateStatus = useAppSelector((s) => s.update.status);
  const availableVersion = useAppSelector((s) => s.update.availableVersion);
  const installing = useAppSelector((s) => s.update.installing);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try { return localStorage.getItem(UPDATE_DISMISS_KEY); } catch { return null; }
  });
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleInstall = useCallback(() => {
    if (installing) return;
    dispatch(setInstalling());
    (window as any).openswarm?.installUpdate();
  }, [installing, dispatch]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionDismissed(true);
    // Squirrel reports no version, so a persisted dismissal there would hide every FUTURE update too; those stay session-only.
    if (availableVersion) {
      try { localStorage.setItem(UPDATE_DISMISS_KEY, availableVersion); } catch {}
      setDismissedVersion(availableVersion);
    }
  }, [availableVersion]);

  const dismissed = sessionDismissed || (availableVersion !== null && dismissedVersion === availableVersion);
  const show = updateStatus === 'downloaded' && !dismissed;

  return (
    <Grow in={show} unmountOnExit>
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleInstall}
        role="button"
        aria-label={availableVersion ? `Restart to update to ${availableVersion}` : 'Restart to update'}
        title={availableVersion ? `OpenSwarm ${availableVersion} downloaded` : 'Update downloaded'}
        sx={{
          position: 'fixed',
          top: 34,
          // Clears the canvas Help pill, which owns the right:16 corner (banners above shift it vertically, so horizontal separation is the stable axis).
          right: 84,
          zIndex: 1400,
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          height: 30,
          pl: 1.25,
          pr: 1,
          borderRadius: 999,
          // Success green, NOT the accent: every other pill on the shell is accent-colored, and an update call-to-action that matches New-dashboard reads as furniture (Chrome's update pill is green for the same reason). Dark mode's lighter green needs dark text.
          bgcolor: c.status.success,
          color: mode === 'dark' ? 'rgba(0,0,0,0.85)' : '#fff',
          boxShadow: `0 0 0 3px ${c.status.success}40, 0 8px 24px rgba(0,0,0,0.35)`,
          cursor: installing ? 'default' : 'pointer',
          userSelect: 'none',
          transition: 'filter 0.2s ease, transform 0.15s ease',
          '&:hover': { filter: installing ? 'none' : 'brightness(1.12)' },
          '&:active': { transform: installing ? 'none' : 'scale(0.97)' },
        }}
      >
        {installing
          ? <CircularProgress size={13} sx={{ color: 'inherit', flexShrink: 0 }} />
          : <RestartAltIcon sx={{ fontSize: 15, flexShrink: 0 }} />}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {installing ? 'Restarting…' : 'Restart to update'}
        </Typography>
        {!installing && (
          <Box
            role="button"
            aria-label="Dismiss update reminder"
            onClick={handleDismiss}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              ml: 0.25,
              borderRadius: '50%',
              opacity: hovered ? 0.8 : 0,
              transition: 'opacity 0.15s ease, background 0.15s ease',
              '&:hover': { opacity: 1, bgcolor: mode === 'dark' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)' },
            }}
          >
            <CloseIcon sx={{ fontSize: 11 }} />
          </Box>
        )}
      </Box>
    </Grow>
  );
};

export default UpdateReadyPill;
