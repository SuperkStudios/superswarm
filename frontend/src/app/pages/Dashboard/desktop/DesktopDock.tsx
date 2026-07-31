import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LanguageIcon from '@mui/icons-material/Language';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { openSettingsCard, openWorkflowsApp } from '@/shared/state/dashboardLayoutSlice';
import SettingsIcon from '@mui/icons-material/Settings';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import { useAppDispatch } from '@/shared/hooks';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import { getWebview } from '@/shared/browserRegistry';
import { buildDockEntries, CardRect, DockEntry } from './dockEntries';
import { openCardContextMenu } from './openCardContextMenu';
import { dockTileMenuRows } from './dockTileMenuRows';
import { useDockLayout } from './useDockLayout';
import { DockTileIcon } from './DockTileIcon';
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

const PREVIEW_W = 190;
const ACTION_COUNT = 4;
const FADE = 18;

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
  const accent = useClaudeTokens().accent.primary;
  const [hovered, setHovered] = useState<{ id: string; top: number } | null>(null);
  const [liveShot, setLiveShot] = useState<{ id: string; dataUrl: string } | null>(null);
  const [edges, setEdges] = useState<{ top: boolean; bottom: boolean }>({ top: false, bottom: false });
  const hoverTimer = useRef<number | null>(null);

  const entries = useMemo<DockEntry[]>(
    () => buildDockEntries({ sessions, cards, viewCards, browserCards, workflowCards, outputs }),
    [sessions, cards, viewCards, browserCards, workflowCards, outputs],
  );

  const { dockRef, scrollRef, tile, gap, iconSize, scrolls, scrollHeight, bleed, applyMagnify } = useDockLayout({
    cardCount: entries.length,
    actionCount: ACTION_COUNT,
    dividerCount: entries.length > 0 ? 2 : 1,
  });

  const endHover = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHovered(null);
    setLiveShot(null);
  }, []);

  const beginHover = useCallback(
    (entry: DockEntry, target: HTMLElement) => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      const box = scrollRef.current;
      const top = target.offsetTop + (box?.contains(target) ? box.offsetTop - box.scrollTop : 0);
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
    [scrollRef],
  );

  const readEdges = useCallback((el: HTMLDivElement) => {
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrolls) readEdges(el);
    else setEdges((prev) => (prev.top || prev.bottom ? { top: false, bottom: false } : prev));
  }, [scrolls, scrollHeight, entries.length, readEdges, scrollRef]);

  // Only fade the end that still has tiles behind it, so a magnified first or last tile stays crisp.
  const mask = scrolls
    ? `linear-gradient(to bottom, rgba(0,0,0,${edges.top ? 0 : 1}) 0px, #000 ${FADE}px, #000 calc(100% - ${FADE}px), rgba(0,0,0,${edges.bottom ? 0 : 1}) 100%)`
    : undefined;

  const hoveredEntry = hovered ? entries.find((e) => e.id === hovered.id) : undefined;
  const previewImage = hoveredEntry
    ? (liveShot?.id === hoveredEntry.id ? liveShot.dataUrl : hoveredEntry.thumbnail || undefined)
    : undefined;

  return (
    <Box
      ref={dockRef}
      data-desktop-dock
      onMouseMove={(e: React.MouseEvent) => applyMagnify(e.clientY)}
      onMouseLeave={() => { endHover(); applyMagnify(null); }}
      sx={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 11,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${gap}px`,
        p: '7px',
        borderRadius: '16px',
        background: 'rgba(22,12,34,0.66)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        // Rounder squircle tiles (real app icons, not lame squares). The magnify transform is set
        // imperatively per-frame by applyMagnify; a short ease smooths the chase + the reset.
        '& .osw-dock-tile': {
          borderRadius: '12px',
          transition: 'transform 0.12s ease-out',
          willChange: 'transform',
        },
        // One source of truth for glyph size, so favicons and every icon pack shrink with the tile.
        '& .osw-dock-tile svg, & .osw-dock-tile img': { width: iconSize, height: iconSize },
      }}
    >
      {entries.length > 0 && (
        <Box
          ref={scrollRef}
          onScroll={scrolls ? (e: React.UIEvent<HTMLDivElement>) => { readEdges(e.currentTarget); endHover(); } : undefined}
          // The canvas zooms on wheel; a wheel we consume here must never reach it.
          onWheel={scrolls ? (e: React.WheelEvent) => e.stopPropagation() : undefined}
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: `${gap}px`,
            ...(scrolls && {
              height: `${scrollHeight}px`,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              // Bleed the clip box past the column so scrolling doesn't crop the magnified tiles.
              width: `${tile + bleed * 2}px`,
              mx: `${-bleed}px`,
              py: `${bleed}px`,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              maskImage: mask,
              WebkitMaskImage: mask,
            }),
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
                onContextMenu={(e: React.MouseEvent) => {
                  endHover();
                  openCardContextMenu(e, { items: dockTileMenuRows(entry, dispatch, () => onFocusCard(entry.id, entry.rect)) });
                }}
                sx={{
                  position: 'relative',
                  width: tile,
                  height: tile,
                  borderRadius: '12px',
                  background: entry.tileBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  flexShrink: 0,
                  transition: 'box-shadow 140ms ease, background 140ms ease',
                  // Same grammar as the minimized rail: soft accent tint, ONE accent inner ring as the carrier, and the icon lifts. The outer glow is decoration, never the signal.
                  ...(isActive && {
                    background: `linear-gradient(0deg, ${accent}1f, ${accent}1f), ${entry.tileBg}`,
                    boxShadow: `inset 0 0 0 1px ${accent}, 0 0 24px ${accent}26`,
                    '& > *': { filter: 'brightness(1.25)' },
                  }),
                }}
              >
                {/* Keyed by url so navigating to a new site re-arms the favicon after a previous one failed. */}
                <DockTileIcon key={entry.faviconUrl || 'glyph'} entry={entry} />
              </Box>
            );
          })}
        </Box>
      )}

      {entries.length > 0 && (
        <Box sx={{ width: tile - 8, height: '1px', background: 'rgba(255,255,255,0.14)' }} />
      )}
      {/* The og toolbar's actions, dock-resident: browser, workflow, then settings + apps below their own divider. New-chat lives in the spawn pill, history on the top island. */}
      {([
        { label: 'New browser', icon: <LanguageIcon sx={{ color: '#e8e8ee' }} />, act: onAddBrowser },
        { label: 'Workflows', icon: <EventRepeatIcon sx={{ color: '#e8e8ee' }} />, act: () => dispatch(openWorkflowsApp()) },
        { label: 'Settings', icon: <SettingsIcon sx={{ color: '#e8e8ee' }} />, act: () => dispatch(openSettingsCard()), divider: true },
        { label: 'Applications', icon: <AppsRoundedIcon sx={{ color: '#e8e8ee' }} />, act: onApplications, bg: 'linear-gradient(135deg, #3d3d46, #232329)' },
      ] as { label: string; icon: React.ReactNode; act: () => void; divider?: boolean; bg?: string }[]).map((a) => (
        <React.Fragment key={a.label}>
          {a.divider && <Box sx={{ width: tile - 8, height: '1px', background: 'rgba(255,255,255,0.14)' }} />}
          <Tooltip title={a.label} placement="right">
            <Box
              className="osw-dock-tile"
              onClick={a.act}
              onMouseEnter={endHover}
              sx={{
                width: tile,
                height: tile,
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
