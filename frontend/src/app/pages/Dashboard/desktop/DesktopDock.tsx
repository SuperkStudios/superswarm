import React, { useCallback, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LanguageIcon from '@mui/icons-material/Language';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { openSettingsCard, openWorkflowsApp } from '@/shared/state/dashboardLayoutSlice';
import SettingsIcon from '@mui/icons-material/Settings';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import { useAppDispatch } from '@/shared/hooks';
import { getWebview } from '@/shared/browserRegistry';
import { buildDockEntries, CardRect, DockEntry } from './dockEntries';
import type { AgentSession } from '@/shared/state/agentsSlice';
import type {
  CardPosition,
  ViewCardPosition,
  BrowserCardPosition,
  WorkflowCardPosition,
} from '@/shared/state/dashboardLayoutSlice';
import type { Output } from '@/shared/state/outputsSlice';

interface DesktopDockProps {
  sessions: Record<string, AgentSession>;
  cards: Record<string, CardPosition>;
  viewCards: Record<string, ViewCardPosition>;
  browserCards: Record<string, BrowserCardPosition>;
  workflowCards: Record<string, WorkflowCardPosition>;
  outputs: Record<string, Output>;
  selectedIds: string[];
  onFocusCard: (id: string, rect: CardRect) => void;
  onApplications: () => void;
  onAddBrowser: () => void;
}

const TILE = 30;
const PREVIEW_W = 190;

/** Left-edge desktop dock: one tile per open card, hover previews, click focuses the window. */
function DesktopDock({
  sessions,
  cards,
  viewCards,
  browserCards,
  workflowCards,
  outputs,
  selectedIds,
  onFocusCard,
  onApplications,
  onAddBrowser,
}: DesktopDockProps): React.ReactElement | null {
  const dispatch = useAppDispatch();
  const dockBodyRef = useRef<HTMLDivElement | null>(null);
  // macOS Dock magnification: the tile under the cursor grows on a bell curve and its neighbors
  // SLIDE AWAY to make room (no horizontal pop-out, the part that read as wobble). Each tile that
  // grows by `extra` pushes every tile past it by extra/2, so the column opens up smoothly.
  const applyDockMagnify = useCallback((clientY: number | null) => {
    const root = dockBodyRef.current;
    if (!root) return;
    const tiles = Array.from(root.querySelectorAll<HTMLElement>('.osw-dock-tile'));
    if (tiles.length === 0) return;
    if (clientY == null) {
      tiles.forEach((t) => { t.style.transform = ''; t.style.zIndex = ''; });
      return;
    }
    const rootTop = root.getBoundingClientRect().top;
    const cy = clientY - rootTop;
    const BOOST = 0.5;   // hovered tile grows to 1.5x
    const FALLOFF = 44;  // px spread of the bell curve (how many neighbors react)
    const bases = tiles.map((t) => t.offsetTop + t.offsetHeight / 2);
    const scales = bases.map((b) => 1 + BOOST * Math.exp(-(((cy - b) / FALLOFF) ** 2)));
    const extra = scales.map((s) => TILE * (s - 1));
    tiles.forEach((t, i) => {
      let shift = 0;
      for (let j = 0; j < tiles.length; j++) {
        if (j === i) continue;
        shift += (extra[j] / 2) * Math.sign(bases[i] - bases[j]);
      }
      t.style.transform = `translateY(${shift.toFixed(1)}px) scale(${scales[i].toFixed(3)})`;
      t.style.transformOrigin = 'left center';
      t.style.zIndex = String(10 + Math.round((scales[i] - 1) * 100));
    });
  }, []);
  const [hovered, setHovered] = useState<{ id: string; top: number } | null>(null);
  const [liveShot, setLiveShot] = useState<{ id: string; dataUrl: string } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const entries = useMemo<DockEntry[]>(
    () => buildDockEntries({ sessions, cards, viewCards, browserCards, workflowCards, outputs }),
    [sessions, cards, viewCards, browserCards, workflowCards, outputs],
  );

  const beginHover = useCallback(
    (entry: DockEntry, target: HTMLElement) => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      const top = target.offsetTop;
      hoverTimer.current = window.setTimeout(() => {
        setHovered({ id: entry.id, top });
        if (entry.browserId) {
          const wv = getWebview(entry.browserId);
          const capture = wv?.capturePage?.();
          if (capture && typeof (capture as Promise<unknown>).then === 'function') {
            (capture as Promise<{ toDataURL(): string }>)
              .then((img) => setLiveShot({ id: entry.id, dataUrl: img.toDataURL() }))
              .catch(() => undefined);
          }
        }
      }, 220);
    },
    [],
  );

  const endHover = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHovered(null);
    setLiveShot(null);
  }, []);

  const hoveredEntry = hovered ? entries.find((e) => e.id === hovered.id) : undefined;
  const previewImage = hoveredEntry
    ? (liveShot?.id === hoveredEntry.id ? liveShot.dataUrl : hoveredEntry.thumbnail || undefined)
    : undefined;

  return (
    <Box
      ref={dockBodyRef}
      data-desktop-dock
      onMouseMove={(e: React.MouseEvent) => applyDockMagnify(e.clientY)}
      onMouseLeave={() => { endHover(); applyDockMagnify(null); }}
      sx={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 11,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '9px',
        p: '7px',
        borderRadius: '16px',
        background: 'rgba(22,12,34,0.66)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        // Rounder squircle tiles (real app icons, not lame squares). The magnify transform is set
        // imperatively per-frame by applyDockMagnify; a short ease smooths the chase + the reset.
        '& .osw-dock-tile': {
          borderRadius: '12px',
          transition: 'transform 0.12s ease-out',
          willChange: 'transform',
        },
      }}
    >
      {entries.map((entry) => {
        const isActive = selectedIds.includes(entry.id);
        return (
          <Box
            key={entry.id}
            className="osw-dock-tile"
            onMouseEnter={(e) => beginHover(entry, e.currentTarget as HTMLElement)}
            onClick={() => {
              endHover();
              onFocusCard(entry.id, entry.rect);
            }}
            sx={{
              position: 'relative',
              width: TILE,
              height: TILE,
              borderRadius: '12px',
              background: entry.tileBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              flexShrink: 0,
              ...(isActive && { outline: '2px solid #6aa2ff', outlineOffset: '2px' }),
            }}
          >
            {entry.icon}
            {entry.faviconUrl && (
              <Box
                component="img"
                src={entry.faviconUrl}
                alt=""
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                sx={{ position: 'absolute', width: 18, height: 18, borderRadius: '6px' }}
              />
            )}
          </Box>
        );
      })}

      {entries.length > 0 && (
        <Box sx={{ width: TILE - 8, height: '1px', background: 'rgba(255,255,255,0.14)' }} />
      )}
      {/* The og toolbar's actions, dock-resident: browser, workflow, then settings + apps below their own divider. New-chat lives in the spawn pill, history on the top island. */}
      {([
        { label: 'New browser', icon: <LanguageIcon sx={{ fontSize: 17, color: '#e8e8ee' }} />, act: onAddBrowser },
        { label: 'Workflows', icon: <EventRepeatIcon sx={{ fontSize: 16, color: '#e8e8ee' }} />, act: () => dispatch(openWorkflowsApp()) },
        { label: 'Settings', icon: <SettingsIcon sx={{ fontSize: 18, color: '#e8e8ee' }} />, act: () => dispatch(openSettingsCard()), divider: true },
        { label: 'Applications', icon: <AppsRoundedIcon sx={{ fontSize: 18, color: '#e8e8ee' }} />, act: onApplications, bg: 'linear-gradient(135deg, #3d3d46, #232329)' },
      ] as { label: string; icon: React.ReactNode; act: () => void; divider?: boolean; bg?: string }[]).map((a) => (
        <React.Fragment key={a.label}>
          {a.divider && <Box sx={{ width: TILE - 8, height: '1px', background: 'rgba(255,255,255,0.14)' }} />}
          <Tooltip title={a.label} placement="right">
            <Box
              className="osw-dock-tile"
              onClick={a.act}
              onMouseEnter={endHover}
              sx={{
                width: TILE,
                height: TILE,
                borderRadius: '12px',
                background: a.bg ?? 'linear-gradient(135deg, #5a5a62, #34343c)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {a.icon}
            </Box>
          </Tooltip>
        </React.Fragment>
      ))}

      {hoveredEntry && (
        <Box
          sx={{
            position: 'absolute',
            left: 'calc(100% + 10px)',
            top: Math.max(0, hovered!.top - 34),
            width: PREVIEW_W,
            borderRadius: '10px',
            overflow: 'hidden',
            background: previewImage ? '#fff' : 'rgba(22,12,34,0.9)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          {previewImage ? (
            <Box component="img" src={previewImage} alt="" sx={{ width: '100%', display: 'block' }} />
          ) : (
            <Box sx={{ p: 1.25 }}>
              <Typography sx={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hoveredEntry.label}
              </Typography>
              {hoveredEntry.snippet && (
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.6875rem', mt: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {hoveredEntry.snippet}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default DesktopDock;
