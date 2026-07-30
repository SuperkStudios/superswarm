import React, { useCallback } from 'react';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import {
  closeSettingsCard,
  setSettingsCardPosition,
  setSettingsCardSize,
  toggleSettingsCardFullscreen,
  SETTINGS_CARD_ID,
} from '@/shared/state/dashboardLayoutSlice';
import type { CardType } from '@/shared/state/dashboardLayoutSlice';
import CanvasWindowCard from '@/app/pages/Dashboard/cards/CanvasWindowCard';
import WindowControls from '@/app/pages/Dashboard/cards/WindowControls';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import SettingsBody from './SettingsBody';

const MIN_W = 640;
const MIN_H = 460;

interface Props {
  cardX: number;
  cardY: number;
  cardWidth: number;
  cardHeight: number;
  cardZOrder?: number;
  getCanvasState: () => { panX: number; panY: number; zoom: number };
  isSelected?: boolean;
  isHighlighted?: boolean;
  multiDragDelta?: { dx: number; dy: number } | null;
  onCardSelect?: (id: string, type: CardType, shiftKey: boolean) => void;
  onDragStart?: (id: string, type: CardType) => void;
  onDragMove?: (dx: number, dy: number, mouseX?: number, mouseY?: number) => void;
  onDragEnd?: (dx: number, dy: number, didDrag: boolean) => void;
  onBringToFront?: (id: string, type: CardType) => void;
}

// Settings as a real dashboard window: same chrome as the Workflows app, same body as the modal.
const SettingsAppCard: React.FC<Props> = ({
  cardX, cardY, cardWidth, cardHeight, cardZOrder = 0,
  getCanvasState,
  isSelected = false, isHighlighted = false, multiDragDelta = null,
  onCardSelect, onDragStart, onDragMove, onDragEnd, onBringToFront,
}) => {
  const c = useClaudeTokens();
  const dispatch = useAppDispatch();
  const isFullscreen = useAppSelector((s) => !!s.dashboardLayout.settingsCard?.fullscreen);

  const commitPosition = useCallback((x: number, y: number) => {
    dispatch(setSettingsCardPosition({ x, y }));
  }, [dispatch]);
  const commitSize = useCallback((width: number, height: number) => {
    dispatch(setSettingsCardSize({ width, height }));
  }, [dispatch]);
  const close = useCallback(() => { dispatch(closeSettingsCard()); }, [dispatch]);

  return (
    <CanvasWindowCard
      cardId={SETTINGS_CARD_ID}
      cardType="settings"
      selectType="settings-card"
      selectName="Settings"
      cardX={cardX}
      cardY={cardY}
      cardWidth={cardWidth}
      cardHeight={cardHeight}
      cardZOrder={cardZOrder}
      fullscreen={isFullscreen}
      minWidth={MIN_W}
      minHeight={MIN_H}
      background={c.bg.page}
      highlightColor={c.accent.primary}
      getCanvasState={getCanvasState}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      multiDragDelta={multiDragDelta}
      onCardSelect={onCardSelect}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onBringToFront={onBringToFront}
      onCommitPosition={commitPosition}
      onCommitSize={commitSize}
    >
      {({ header, onTileZone }) => (
        <>
          <div
            onPointerDown={header.onPointerDown}
            onPointerMove={header.onPointerMove}
            onPointerUp={header.onPointerUp}
            onPointerCancel={header.onPointerCancel}
            onLostPointerCapture={header.onLostPointerCapture}
            style={{
              height: 42, flex: 'none', display: 'flex', alignItems: 'center', gap: 14,
              padding: '0 16px', borderBottom: `1px solid ${c.border.subtle}`, background: c.bg.surface,
              cursor: header.dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
            }}
          >
            <span
              className="osw-card"
              data-no-drag
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <WindowControls
                onClose={close}
                onMinimize={close}
                onTile={(zone) => {
                  if (zone === 'fullscreen' || zone === 'restore') { dispatch(toggleSettingsCardFullscreen()); return; }
                  if (isFullscreen) dispatch(toggleSettingsCardFullscreen());
                  onTileZone(zone);
                }}
                tiled={isFullscreen}
                noTileMenu={isFullscreen}
              />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SettingsIcon sx={{ fontSize: 18, color: c.text.secondary, display: 'block' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: c.text.primary, lineHeight: 1 }}>Settings</span>
            </div>
          </div>
          <SettingsBody active requestedTab={null} onRequestClose={close} />
        </>
      )}
    </CanvasWindowCard>
  );
};

export default SettingsAppCard;
