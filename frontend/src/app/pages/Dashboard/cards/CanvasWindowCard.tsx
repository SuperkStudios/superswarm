import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import { TILE_ZONES, useTiledStyle } from './tileZones';
import { useCanvasWindowResize } from './useCanvasWindowResize';
import { useDragEndBackstops } from '../hooks/interaction/useDragEndBackstops';
import type { CardType } from '@/shared/state/dashboardLayoutSlice';

const DRAG_THRESHOLD = 3;
const SNAP_GRID = 24;
const TILE_GAP = 8;

/** Drag handlers the window hands down to whatever renders its title bar. */
export interface CanvasWindowHeader {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  dragging: boolean;
}

export interface CanvasWindowChrome {
  header: CanvasWindowHeader;
  onTileZone: (zone: string) => void;
}

interface CanvasWindowCardProps {
  cardId: string;
  cardType: CardType;
  /** data-select-type / data-select-meta values: the DOM contract paste + onboarding selectors read. */
  selectType: string;
  selectName: string;
  cardX: number; cardY: number; cardWidth: number; cardHeight: number; cardZOrder?: number;
  fullscreen?: boolean;
  /** Parked in the minimized rail: stays mounted (and keeps its state) off-canvas instead of unmounting. */
  minimized?: boolean;
  minWidth: number; minHeight: number;
  background: string; highlightColor: string;
  getCanvasState: () => { panX: number; panY: number; zoom: number };
  isSelected?: boolean; isHighlighted?: boolean;
  multiDragDelta?: { dx: number; dy: number } | null;
  onCardSelect?: (id: string, type: CardType, shiftKey: boolean) => void;
  onDragStart?: (id: string, type: CardType) => void;
  onDragMove?: (dx: number, dy: number, mouseX?: number, mouseY?: number) => void;
  onDragEnd?: (dx: number, dy: number, didDrag: boolean) => void;
  onBringToFront?: (id: string, type: CardType) => void;
  onCommitPosition: (x: number, y: number) => void;
  onCommitSize: (width: number, height: number) => void;
  children: (chrome: CanvasWindowChrome) => React.ReactNode;
}

// Window chrome for the singleton app cards (Workflows, Settings): drag by the title bar, 8 resize
// handles, tile zones, fullscreen. Geometry lives in the slice; the host passes commit callbacks so
// this stays reducer-agnostic, and renders its body through the children render prop.
const CanvasWindowCard: React.FC<CanvasWindowCardProps> = ({
  cardId, cardType, selectType, selectName,
  cardX, cardY, cardWidth, cardHeight, cardZOrder = 0,
  fullscreen = false, minimized = false, minWidth, minHeight, background, highlightColor,
  getCanvasState,
  isSelected = false, isHighlighted = false, multiDragDelta = null,
  onCardSelect, onDragStart, onDragMove, onDragEnd, onBringToFront,
  onCommitPosition, onCommitSize,
  children,
}) => {
  const c = useClaudeTokens();
  // Fullscreen pins the card to the viewport, so its geometry must track pan/zoom like the tiled
  // agent/browser cards; reuse the exact same helper. Subscribe to pan only while fullscreen.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onPan = (): void => forceTick((t) => t + 1);
    window.addEventListener('openswarm:canvas-pan-changed', onPan);
    return () => window.removeEventListener('openswarm:canvas-pan-changed', onPan);
  }, [fullscreen]);
  const cam = getCanvasState();
  const fsStyle = useTiledStyle(fullscreen ? 'fullscreen' : undefined, cam.panX, cam.panY, cam.zoom, getCanvasState, cardId);

  // ---- Drag (title bar is the handle) ----
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; startPanX: number; startPanY: number } | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [localDragPos, setLocalDragPos] = useState<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const justDraggedRef = useRef(false);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (fullscreen) return;  // pinned to the viewport, no drag until restored
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag], button, [role="button"], input, textarea, select')) return;
    e.preventDefault();
    e.stopPropagation();
    const cs = getCanvasState();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: cardX, origY: cardY, startPanX: cs.panX, startPanY: cs.panY };
    didDrag.current = false;
    setIsDragging(true);
    onDragStart?.(cardId, cardType);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [cardId, cardType, cardX, cardY, fullscreen, onDragStart, getCanvasState]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const rawDx = e.clientX - dragState.current.startX;
    const rawDy = e.clientY - dragState.current.startY;
    if (!didDrag.current && Math.sqrt(rawDx * rawDx + rawDy * rawDy) < DRAG_THRESHOLD) return;
    didDrag.current = true;
    lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    const cs = getCanvasState();
    const z = cs.zoom;
    const panDx = (cs.panX - dragState.current.startPanX) / z;
    const panDy = (cs.panY - dragState.current.startPanY) / z;
    const dx = rawDx / z - panDx;
    const dy = rawDy / z - panDy;
    setLocalDragPos({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
    onDragMove?.(dx, dy, e.clientX, e.clientY);
  }, [onDragMove, getCanvasState]);

  const finalizeDrag = useCallback((clientX: number, clientY: number, shiftKey: boolean) => {
    if (!dragState.current) return;
    const cs = getCanvasState();
    const z = cs.zoom;
    const panDx = (cs.panX - dragState.current.startPanX) / z;
    const panDy = (cs.panY - dragState.current.startPanY) / z;
    const dx = (clientX - dragState.current.startX) / z - panDx;
    const dy = (clientY - dragState.current.startY) / z - panDy;
    if (didDrag.current) {
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      let finalX = dragState.current.origX + dx;
      let finalY = dragState.current.origY + dy;
      if (!shiftKey) { finalX = Math.round(finalX / SNAP_GRID) * SNAP_GRID; finalY = Math.round(finalY / SNAP_GRID) * SNAP_GRID; }
      onCommitPosition(finalX, finalY);
    }
    onDragEnd?.(dx, dy, didDrag.current);
    dragState.current = null;
    didDrag.current = false;
    setLocalDragPos(null);
    setIsDragging(false);
  }, [onCommitPosition, onDragEnd, getCanvasState]);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    finalizeDrag(e.clientX, e.clientY, e.shiftKey);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* capture already gone */ }
  }, [finalizeDrag]);

  const abortDrag = useCallback(() => {
    if (!dragState.current) return;
    finalizeDrag(lastPointerRef.current.clientX, lastPointerRef.current.clientY, true);
  }, [finalizeDrag]);
  useDragEndBackstops(isDragging, finalizeDrag, abortDrag);

  const { isResizing, live: localResize, handles } = useCanvasWindowResize({
    cardX, cardY, cardWidth, cardHeight, minWidth, minHeight,
    getCanvasState, onCommitPosition, onCommitSize,
  });

  const onTileZone = useCallback((zone: string) => {
    const z = TILE_ZONES[zone];
    const vp = document.querySelector('[data-canvas-viewport]')?.getBoundingClientRect();
    if (!z || !vp) return;
    const camera = getCanvasState();
    onCommitPosition((z.x * vp.width + TILE_GAP - camera.panX) / camera.zoom, (z.y * vp.height + TILE_GAP - camera.panY) / camera.zoom);
    onCommitSize((z.w * vp.width - TILE_GAP * 2) / camera.zoom, (z.h * vp.height - TILE_GAP * 2) / camera.zoom);
  }, [getCanvasState, onCommitPosition, onCommitSize]);

  const mdDx = (!isDragging && !isResizing && isSelected && multiDragDelta) ? multiDragDelta.dx : 0;
  const mdDy = (!isDragging && !isResizing && isSelected && multiDragDelta) ? multiDragDelta.dy : 0;
  const dx = (localResize?.x ?? localDragPos?.x ?? cardX) + mdDx;
  const dy = (localResize?.y ?? localDragPos?.y ?? cardY) + mdDy;
  const dw = localResize?.w ?? cardWidth;
  const dh = localResize?.h ?? cardHeight;

  const border = isHighlighted ? `2px solid ${highlightColor}` : isSelected ? '2px solid #3b82f6' : `1px solid ${c.border.subtle}`;
  const noTransition = isDragging || isResizing || (isSelected && !!multiDragDelta);

  return (
    <div
      data-select-type={selectType}
      data-select-id={cardId}
      data-select-meta={JSON.stringify({ name: selectName })}
      onPointerDownCapture={(e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-no-drag]')) return;
        onBringToFront?.(cardId, cardType);
      }}
      onClick={(e: React.MouseEvent) => {
        if (justDraggedRef.current) return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-no-drag]')) return;
        onCardSelect?.(cardId, cardType, e.shiftKey);
      }}
      data-keepalive-hidden={minimized ? '1' : undefined}
      style={{
        position: 'absolute',
        contain: 'layout style',
        willChange: 'transform',
        // Parked windows go off-canvas rather than unmounting, so Settings keeps its form and Workflows its view state.
        pointerEvents: minimized ? 'none' : undefined,
        // Belt and braces: leaving fullscreen tears down the tiled-style hook, whose cleanup strips the inline left/top React just wrote, and visibility is the one park signal it never touches.
        visibility: minimized ? 'hidden' : undefined,
        left: minimized ? -100000 : fsStyle ? fsStyle.left : dx,
        top: minimized ? -100000 : fsStyle ? fsStyle.top : dy,
        width: fsStyle ? fsStyle.width : dw,
        height: fsStyle ? fsStyle.height : dh,
        transform: minimized ? undefined : fsStyle ? fsStyle.transform : undefined,
        transformOrigin: fsStyle ? fsStyle.transformOrigin : undefined,
        background,
        border: fsStyle ? 'none' : border,
        borderRadius: c.radius.lg,
        boxShadow: (isDragging || isResizing) ? c.shadow.lg : c.shadow.md,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: fsStyle ? 999990 : (isDragging || isResizing) ? 999999 : cardZOrder,
        transition: noTransition ? 'none' : 'box-shadow 0.3s ease, border-color 0.2s ease',
      }}
    >
      {children({
        header: {
          onPointerDown: onHeaderPointerDown,
          onPointerMove: onHeaderPointerMove,
          onPointerUp: onHeaderPointerUp,
          onPointerCancel: abortDrag,
          onLostPointerCapture: abortDrag,
          dragging: isDragging,
        },
        onTileZone,
      })}

      {!fullscreen && !minimized && handles.map((h) => (
        <div
          key={h.dir}
          data-no-drag
          onPointerDown={h.onPointerDown}
          onPointerMove={h.onPointerMove}
          onPointerUp={h.onPointerUp}
          style={h.style}
        />
      ))}
    </div>
  );
};

export default CanvasWindowCard;
