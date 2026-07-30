import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import { TILE_ZONES, useTiledStyle } from './tileZones';
import { useDragEndBackstops } from '../hooks/interaction/useDragEndBackstops';
import type { CardType } from '@/shared/state/dashboardLayoutSlice';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE = 6;
const CORNER = 14;
const DRAG_THRESHOLD = 3;
const SNAP_GRID = 24;
const TILE_GAP = 8;

const CURSOR_MAP: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
};
const HANDLE_DEFS: { dir: ResizeDir; css: React.CSSProperties }[] = [
  { dir: 'n', css: { top: -EDGE / 2, left: CORNER, right: CORNER, height: EDGE } },
  { dir: 's', css: { bottom: -EDGE / 2, left: CORNER, right: CORNER, height: EDGE } },
  { dir: 'w', css: { left: -EDGE / 2, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: 'e', css: { right: -EDGE / 2, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: 'nw', css: { top: -EDGE / 2, left: -EDGE / 2, width: CORNER, height: CORNER } },
  { dir: 'ne', css: { top: -EDGE / 2, right: -EDGE / 2, width: CORNER, height: CORNER } },
  { dir: 'sw', css: { bottom: -EDGE / 2, left: -EDGE / 2, width: CORNER, height: CORNER } },
  { dir: 'se', css: { bottom: -EDGE / 2, right: -EDGE / 2, width: CORNER, height: CORNER } },
];

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
  fullscreen = false, minWidth, minHeight, background, highlightColor,
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

  // ---- Resize ----
  const resizeRef = useRef<{ dir: ResizeDir; sx0: number; sy0: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [localResize, setLocalResize] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const onResizeDown = useCallback((dir: ResizeDir) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { dir, sx0: e.clientX, sy0: e.clientY, ox: cardX, oy: cardY, ow: cardWidth, oh: cardHeight };
    setIsResizing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [cardX, cardY, cardWidth, cardHeight]);

  const compute = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return null;
    const { dir, sx0, sy0, ox, oy, ow, oh } = resizeRef.current;
    const z2 = getCanvasState().zoom;
    const dx = (e.clientX - sx0) / z2;
    const dy = (e.clientY - sy0) / z2;
    let nx = ox, ny = oy, nw = ow, nh = oh;
    if (dir.includes('e')) nw = ow + dx;
    if (dir.includes('w')) { nw = ow - dx; nx = ox + dx; }
    if (dir.includes('s')) nh = oh + dy;
    if (dir.includes('n')) { nh = oh - dy; ny = oy + dy; }
    if (nw < minWidth) { if (dir.includes('w')) nx = ox + ow - minWidth; nw = minWidth; }
    if (nh < minHeight) { if (dir.includes('n')) ny = oy + oh - minHeight; nh = minHeight; }
    return { x: nx, y: ny, w: nw, h: nh };
  }, [getCanvasState, minWidth, minHeight]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    const r = compute(e);
    if (r) setLocalResize(r);
  }, [compute]);

  const onResizeUp = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const r = compute(e);
    if (r) {
      onCommitPosition(r.x, r.y);
      onCommitSize(r.w, r.h);
    }
    resizeRef.current = null;
    setLocalResize(null);
    setIsResizing(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [compute, onCommitPosition, onCommitSize]);

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
      style={{
        position: 'absolute',
        contain: 'layout style',
        willChange: 'transform',
        left: fsStyle ? fsStyle.left : dx,
        top: fsStyle ? fsStyle.top : dy,
        width: fsStyle ? fsStyle.width : dw,
        height: fsStyle ? fsStyle.height : dh,
        transform: fsStyle ? fsStyle.transform : undefined,
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

      {!fullscreen && HANDLE_DEFS.map(({ dir, css }) => (
        <div
          key={dir}
          data-no-drag
          onPointerDown={onResizeDown(dir)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{ position: 'absolute', cursor: CURSOR_MAP[dir], zIndex: 25, ...css }}
        />
      ))}
    </div>
  );
};

export default CanvasWindowCard;
