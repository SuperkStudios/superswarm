import React from 'react';
import Box from '@mui/material/Box';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import {
  toggleMinimizeCard, setTiledCard, recordClosedCard,
  closeSettingsCard, closeWorkflowsApp, toggleSettingsCardFullscreen, toggleWorkflowsHubFullscreen,
} from '@/shared/state/dashboardLayoutSlice';
import { removeBrowserCardCleanly } from '@/shared/browserTeardown';
import { removeViewCardCleanly } from '@/shared/viewTeardown';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import { GLASS_SURFACE, GLASS_SURFACE_BLUR } from '@/shared/styles/glassSurface';
import { dropMinimizedShot } from './minimizedShots';
import { buildMinimizedEntries, MinimizedEntry, MinimizedRect } from './minimizedEntries';
import MinimizedTile, { MINIMIZED_TILE_W } from './MinimizedTile';
import { openCardContextMenu } from './openCardContextMenu';
import { tileMenuRows } from '../cards/tileMenuRows';
import type { BrowserCardPosition, ViewCardPosition } from '@/shared/state/dashboardLayoutSlice';
import type { Output } from '@/shared/state/outputsSlice';

interface MinimizedStackProps {
  browserCards: Record<string, BrowserCardPosition>;
  viewCards: Record<string, ViewCardPosition>;
  outputs: Record<string, Output>;
  selectedIds: string[];
  onRestore: (id: string, rect: MinimizedRect) => void;
}

/** Right-edge rail of parked windows, browsers and apps alike; click a tile to put it back. */
function MinimizedStack({ browserCards, viewCards, outputs, selectedIds, onRestore }: MinimizedStackProps): React.ReactElement | null {
  const dispatch = useAppDispatch();
  const c = useClaudeTokens();
  const minimizedCards = useAppSelector((s) => s.dashboardLayout.minimizedCards);
  const workflowsHub = useAppSelector((s) => s.dashboardLayout.workflowsHub);
  const settingsCard = useAppSelector((s) => s.dashboardLayout.settingsCard);
  const entries = buildMinimizedEntries({ browserCards, viewCards, outputs, workflowsHub, settingsCard, minimizedCards });
  if (entries.length === 0) return null;

  const restore = (entry: MinimizedEntry): void => {
    dropMinimizedShot(entry.id);
    dispatch(toggleMinimizeCard({ cardId: entry.id }));
    onRestore(entry.id, entry.rect);
  };
  const close = (entry: MinimizedEntry): void => {
    dropMinimizedShot(entry.id);
    if (entry.kind === 'browser') {
      dispatch(recordClosedCard({ kind: 'browser', id: entry.id }));
      void removeBrowserCardCleanly(entry.id, dispatch);
    } else if (entry.kind === 'view') {
      dispatch(recordClosedCard({ kind: 'view', id: entry.id }));
      void removeViewCardCleanly(entry.id, dispatch);
    } else if (entry.kind === 'workflows') {
      dispatch(closeWorkflowsApp());
    } else {
      dispatch(closeSettingsCard());
    }
  };
  // Singletons own a fullscreen flag instead of a tiledCards entry, so a setTiledCard here would strand a ghost fullscreen owner nothing renders.
  const tile = (entry: MinimizedEntry, zone: string): void => {
    restore(entry);
    if (entry.kind === 'workflows') { if (zone === 'fullscreen') dispatch(toggleWorkflowsHubFullscreen()); return; }
    if (entry.kind === 'settings') { if (zone === 'fullscreen') dispatch(toggleSettingsCardFullscreen()); return; }
    if (zone !== 'restore') dispatch(setTiledCard({ cardId: entry.id, zone }));
  };

  return (
    <Box
      data-minimized-rail
      // Must stay OUTSIDE the canvas transform: a transformed ancestor becomes the containing block, so a rail nested in there would ride the camera.
      sx={{
        position: 'absolute',
        right: 14,
        top: 120,
        zIndex: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        p: '6px',
        borderRadius: '16px',
        width: MINIMIZED_TILE_W + 12,
        maxHeight: 'calc(100% - 220px)',
        overflowY: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        background: GLASS_SURFACE,
        backdropFilter: GLASS_SURFACE_BLUR,
        WebkitBackdropFilter: GLASS_SURFACE_BLUR,
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        '@keyframes osw-min-tile-in': {
          from: { opacity: 0, transform: 'scale(0.96)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
        // A minimize is a physical snap, so the aggressive out-ease; nothing here loops.
        '& .osw-min-tile': { animation: 'osw-min-tile-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both' },
        '@media (prefers-reduced-motion: reduce)': {
          '& .osw-min-tile': { animation: 'none' },
        },
      }}
    >
      {entries.map((entry) => (
        <MinimizedTile
          key={entry.id}
          entry={entry}
          accent={c.accent.primary}
          selected={selectedIds.includes(entry.id)}
          onRestore={() => restore(entry)}
          onClose={() => close(entry)}
          onTile={(zone: string) => tile(entry, zone)}
          onContextMenu={(e: React.MouseEvent) => openCardContextMenu(e, {
            items: [
              { label: 'Restore', onClick: () => restore(entry) },
              { label: 'Restore full screen', onClick: () => tile(entry, 'fullscreen') },
              ...(entry.kind === 'browser' || entry.kind === 'view'
                ? [{ label: 'Tile to zone', submenu: tileMenuRows((zone) => tile(entry, zone)) }]
                : []),
              { kind: 'separator' },
              { label: 'Close', danger: true, onClick: () => close(entry) },
            ],
          })}
        />
      ))}
    </Box>
  );
}

export default MinimizedStack;
