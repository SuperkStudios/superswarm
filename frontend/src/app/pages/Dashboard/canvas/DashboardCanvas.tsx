import React, { useEffect, type RefObject } from 'react';
import Box from '@mui/material/Box';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { addViewCard, clearTiledCard, toggleMinimizeCard, selectFullscreenCardId } from '@/shared/state/dashboardLayoutSlice';
import DashboardHeader from './DashboardHeader';
import TetherLayerHost from './TetherLayerHost';
import DashboardCardLayer from './DashboardCardLayer';
import DashboardOverlays from './DashboardOverlays';
import CardContextMenu from '../desktop/CardContextMenu';
import { useCanvasContextMenu } from './useCanvasContextMenu';
import DashboardEmptyState from './DashboardEmptyState';
import '../desktop/desktop.css';
import DesktopDock from '../desktop/DesktopDock';
import MinimizedStack from '../desktop/MinimizedStack';
import ApplicationsWindow from '../desktop/ApplicationsWindow';
import type { ClaudeTokens } from '@/shared/styles/claudeTokens';
import { useThemeAccent, useThemeWash } from '@/shared/styles/ThemeContext';
import { GRAIN_URL } from '@/shared/styles/grainTexture';
import { washBackgroundUrl, effectiveWashStops } from '@/shared/styles/washBackground';
import type { AgentSession } from '@/shared/state/agentsSlice';
import type {
  CardPosition,
  ViewCardPosition,
  BrowserCardPosition,
  WorkflowCardPosition,
  WorkflowsHubPosition,
} from '@/shared/state/dashboardLayoutSlice';
import type { Output } from '@/shared/state/outputsSlice';
import type { CardType, useDashboardSelection } from '../hooks/state/useDashboardSelection';
import type { useCanvasControls } from '../hooks/interaction/useCanvasControls';
import { useWebviewSuspend } from '../hooks/interaction/useWebviewSuspend';
import { deleteSelectedCards } from '../hooks/interaction/deleteSelectedCards';
import type { TetherInputs } from '../geometry/dashboardTethers';

type Selection = ReturnType<typeof useDashboardSelection>;
type Canvas = ReturnType<typeof useCanvasControls>;
type SpawnOrigin = { x: number; y: number; type?: 'branch' };
type GlowingAgentCard = { sourceId: string; fading: boolean; sourceYRatio?: number; label?: string };
type Direction = 'left' | 'right' | 'up' | 'down';
type NeighborDirections = { left: boolean; right: boolean; up: boolean; down: boolean };

interface DashboardCanvasProps {
  c: ClaudeTokens;
  dashboardId: string;
  dashboardName?: string;
  canvas: Canvas;
  selection: Selection;
  sessions: Record<string, AgentSession>;
  sessionList: AgentSession[];
  cards: Record<string, CardPosition>;
  viewCards: Record<string, ViewCardPosition>;
  browserCards: Record<string, BrowserCardPosition>;
  keepAliveBrowserCards: Record<string, BrowserCardPosition>;
  workflowCards: Record<string, WorkflowCardPosition>;
  workflowsHub: WorkflowsHubPosition | null;
  outputs: Record<string, Output>;
  glowingAgentCards: Record<string, GlowingAgentCard>;
  expandedSessionIds: string[];
  tetherInputs: TetherInputs;
  highlightedCardId: string | null;
  autoFocusSessionId: string | null;
  focusedCardId: string | null;
  multiDragDelta: { dx: number; dy: number } | null;
  shakeDirection: Direction | null;
  neighborDirections: NeighborDirections;
  toolbarOpen: boolean;
  searchPaletteOpen: boolean;
  newAgentBounce: boolean;
  canvasEmpty: boolean;
  toolbarRef: RefObject<HTMLDivElement>;
  spawnOriginsRef: RefObject<Record<string, SpawnOrigin>>;
  revealSpawnedRef: RefObject<Set<string>>;
  measuredHeightsRef: RefObject<Record<string, number>>;
  getCanvasState: () => { panX: number; panY: number; zoom: number };
  onViewportMouseDown: (e: React.MouseEvent) => void;
  onViewportMouseMove: (e: React.MouseEvent) => void;
  /** Returns true when the release ended a marquee drag rather than a plain click. */
  onViewportMouseUp: (e: React.MouseEvent) => boolean;
  onViewportDoubleClick: (e: React.MouseEvent) => void;
  onCardSelect: (id: string, type: CardType, shiftKey: boolean, originTarget?: EventTarget | null) => void;
  onDragStart: (id: string, type: CardType) => void;
  onDragMove: (dx: number, dy: number, mouseX?: number, mouseY?: number) => void;
  onDragEnd: (dx: number, dy: number, didDrag: boolean) => void;
  onCardDoubleClick: (id: string, type: CardType) => void;
  onBringToFront: (id: string, type: CardType) => void;
  onBranch: (sourceSessionId: string, newSessionId: string) => void;
  onMeasuredHeight: (sessionId: string, height: number) => void;
  onHighlightCard: (cardId: string) => void;
  onNewAgent: () => void;
  onToolbarCancel: () => void;
  onToolbarSend: (...args: any[]) => void;
  onStarter: (prompt: string, mode?: string) => void;
  toolbarPrefill?: string;
  toolbarPrefillMode?: string;
  onAddView: (outputId: string, opts?: { newInstance?: boolean }) => void;
  onHistoryResume: (sessionId: string) => void;
  onAddBrowser: () => void;
  onNewAgentBounceEnd: () => void;
  onFitToView: () => void;
  onTidy: () => void;
  onSearchPaletteClose: () => void;
}

const DashboardCanvas: React.FC<DashboardCanvasProps> = ({
  c,
  dashboardId,
  dashboardName,
  canvas,
  selection,
  sessions,
  sessionList,
  cards,
  viewCards,
  browserCards,
  keepAliveBrowserCards,
  workflowCards,
  workflowsHub,
  outputs,
  glowingAgentCards,
  expandedSessionIds,
  tetherInputs,
  highlightedCardId,
  autoFocusSessionId,
  focusedCardId,
  multiDragDelta,
  shakeDirection,
  neighborDirections,
  toolbarOpen,
  searchPaletteOpen,
  newAgentBounce,
  canvasEmpty,
  toolbarRef,
  spawnOriginsRef,
  revealSpawnedRef,
  measuredHeightsRef,
  getCanvasState,
  onViewportMouseDown,
  onViewportMouseMove,
  onViewportMouseUp,
  onViewportDoubleClick,
  onCardSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCardDoubleClick,
  onBringToFront,
  onBranch,
  onMeasuredHeight,
  onHighlightCard,
  onNewAgent,
  onToolbarCancel,
  onToolbarSend,
  onStarter,
  toolbarPrefill,
  toolbarPrefillMode,
  onAddView,
  onHistoryResume,
  onAddBrowser,
  onNewAgentBounceEnd,
  onFitToView,
  onTidy,
  onSearchPaletteClose,
}) => {
  const { accent, gradient } = useThemeAccent();
  const { washOpacity, grain } = useThemeWash();
  // A single picked color stores gradient=null, so fall back to the accent (mirrors BeatShell).
  const washStops = effectiveWashStops(gradient, accent);
  const dotSize = Math.max(1, 1.5 * canvas.zoom);
  const dotSpacing = 24 * canvas.zoom;

  useWebviewSuspend(browserCards, canvas.panX, canvas.panY, canvas.zoom, canvas.viewportRef);

  // macOS full screen: one card owns the whole window, every piece of chrome steps aside; Esc exits.
  const dispatch = useAppDispatch();
  const fullscreenCardId = useAppSelector(selectFullscreenCardId);
  const minimizedCards = useAppSelector((s) => s.dashboardLayout.minimizedCards);
  const anyFullscreen = !!fullscreenCardId;
  const [headerRevealed, setHeaderRevealed] = React.useState(false);
  const [appsWindowOpen, setAppsWindowOpen] = React.useState(false);
  const openCanvasMenu = useCanvasContextMenu({
    dispatch, dashboardId, expandedSessionIds, selection, canvasEmpty,
    viewportRef: canvas.viewportRef, getCamera: canvas.actions.getLiveState,
    onNewAgent, onAddBrowser, onApplications: () => setAppsWindowOpen(true), onTidy, onFitToView,
  });
  useEffect(() => {
    if (!fullscreenCardId) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dispatch(clearTiledCard(fullscreenCardId));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreenCardId, dispatch]);

  // While the sidebar is docked, its top strip (a window drag region) hides the traffic lights AND
  // eats the hover that would reveal them, so keep them visible the whole time the sidebar is open,
  // like every Mac app with a sidebar. Only the immersive collapsed/fullscreen state hover-reveals.
  const [chromeDocked, setChromeDocked] = React.useState(false);
  useEffect(() => {
    const onDocked = (e: Event): void => setChromeDocked(!!(e as CustomEvent).detail?.docked);
    window.addEventListener('openswarm:chrome-docked', onDocked);
    return () => window.removeEventListener('openswarm:chrome-docked', onDocked);
  }, []);

  // Arc-style chrome: the mac traffic lights ride the top-edge hover, in fullscreen too (Arc/Zen both
  // keep the native buttons reachable in compact/fullscreen; Zen even exempts them from hover-leave).
  useEffect(() => {
    // While a card is fullscreen its OWN lights are the window controls; showing the natives too reads as double chrome.
    window.openswarm?.setWindowButtonsVisible?.(!anyFullscreen && (headerRevealed || chromeDocked));
  }, [headerRevealed, chromeDocked, anyFullscreen]);

  // Reveal on any pointer graze of the top edge. The old 22px strip Box was dead in practice: the
  // hidden header overlay's pointer-events:auto children sat above it and ate the mouseenter.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (e.clientY <= 22) setHeaderRevealed(true);
      else if (fullscreenCardId && e.clientY > 80) setHeaderRevealed(false);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [fullscreenCardId]);

  // Stable identities for the memoized shell children: an inline closure or Array.from() here would hand them a fresh prop every render, and a card drag re-renders this component per frame (liveDragInfo), which is exactly when they must bail.
  const selectedIdList = React.useMemo(() => Array.from(selection.selectedIds.keys()) as string[], [selection.selectedIds]);
  const handleRestoreCard = React.useCallback((cardId: string, rect: { x: number; y: number; width: number; height: number }) => {
    canvas.actions.fitToCards([rect], 1.15, true);
    onHighlightCard?.(cardId);
  }, [canvas.actions, onHighlightCard]);
  const handleFocusCard = React.useCallback((cardId: string, rect: { x: number; y: number; width: number; height: number }) => {
    // A parked card sits off-canvas, so flying to its stored rect would land on empty space; unpark it first.
    if (minimizedCards[cardId]) dispatch(toggleMinimizeCard({ cardId }));
    canvas.actions.fitToCards([rect], 1.15, true);
    onHighlightCard?.(cardId);
  }, [minimizedCards, dispatch, canvas.actions, onHighlightCard]);
  const handleToggleApps = React.useCallback(() => setAppsWindowOpen((v) => !v), []);
  const handleDeleteSelected = React.useCallback(() => {
    deleteSelectedCards(selection.selectedIds, dispatch);
    selection.deselectAll();
  }, [selection, dispatch]);

  // Gestures write the transform imperatively (no React commit per frame), so a foreign render mid-gesture would paint the stale committed transform for a frame. Re-applying live after EVERY render seals that; do not remove.
  React.useLayoutEffect(() => {
    canvas.actions.syncTransform();
  });

  return (
    <>
    <Box sx={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {/* Floating header overlay */}
      <Box
        onMouseLeave={() => setHeaderRevealed(false)}
        sx={{
          display: fullscreenCardId ? 'none' : undefined,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          pointerEvents: headerRevealed ? undefined : 'none',
          opacity: headerRevealed ? 1 : 0,
          transform: headerRevealed ? 'translateY(0)' : 'translateY(-6px)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
          // p: 3 (24px) was leaving a chunky air gap between the sidebar edge and the dashboard header that read as "two disconnected panels" rather than one continuous surface. 0.75 (6px) tightens the inset so the header floats just inside the content area without losing its breathing room from the top-most pixel.
          pt: 0.75,
          pr: 0.75,
          pb: 0,
          // Clears the macOS traffic lights when the sidebar is docked away (AppShell sets the var); 6px otherwise.
          pl: 'var(--osw-header-inset, 6px)',
          // No scrim: the header carries its own translucent pill (DashboardHeader), so a full-width
          // page->transparent fade here just read as a light-leak band over the themed canvas.
        }}
      >
        {/* Must follow the reveal: an always-auto child overrides the hidden overlay's pointer-events:none and swallowed the whole top strip, so a top/left-tiled window's traffic lights were unclickable. */}
        <Box sx={{ display: 'flex', alignItems: 'center', pointerEvents: headerRevealed ? 'auto' : 'none' }}>
          <DashboardHeader
            dashboardName={dashboardName}
            sessions={sessions}
            cards={cards}
            viewCards={viewCards}
            browserCards={browserCards}
            workflowCards={workflowCards}
            workflowsHub={workflowsHub}
            expandedSessionIds={expandedSessionIds}
            outputs={outputs}
            dashboardId={dashboardId}
            canvasActions={canvas.actions}
            onHighlightCard={onHighlightCard}
            historyAvailable={!anyFullscreen}
          />
        </Box>
      </Box>

      {!anyFullscreen && (
        <MinimizedStack
          browserCards={browserCards}
          viewCards={viewCards}
          outputs={outputs}
          selectedIds={selectedIdList}
          onRestore={handleRestoreCard}
        />
      )}

      {!anyFullscreen && (
        <DesktopDock
          sessions={sessions}
          cards={cards}
          viewCards={viewCards}
          browserCards={browserCards}
          workflowCards={workflowCards}
          outputs={outputs}
          selectedIds={selectedIdList}
          onFocusCard={handleFocusCard}
          onApplications={handleToggleApps}
          onAddBrowser={onAddBrowser}
        />
      )}

      {appsWindowOpen && !fullscreenCardId && (
        <ApplicationsWindow
          outputs={outputs}
          onOpenApp={(outputId) => dispatch(addViewCard({ outputId }))}
          onClose={() => setAppsWindowOpen(false)}
        />
      )}

      {/* Canvas viewport */}
      <Box
        ref={canvas.viewportRef}
        data-canvas-viewport
        onMouseDown={onViewportMouseDown}
        onMouseMove={onViewportMouseMove}
        onMouseUp={(e) => {
          const marqueed = onViewportMouseUp(e);
          // The right button belongs to the marquee, so the canvas menu waits for the release and
          // only opens when nothing was rubber-banded. Opening on press stole the drag.
          if (e.button === 2 && !marqueed) openCanvasMenu(e);
        }}
        onDoubleClick={onViewportDoubleClick}
        onContextMenu={(e: React.MouseEvent) => {
          // Bare canvas: kill the native menu (Inspect Element in dev) so the right-drag stays clean.
          const t = e.target as HTMLElement;
          if (!t.closest('[data-select-id]') && !t.closest('input, textarea, [contenteditable]')) e.preventDefault();
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          cursor: canvas.isPanning
            ? 'grabbing'
            : (canvas.spaceHeld || canvas.cmdHeld)
              ? 'grab'
              : selection.marquee
                ? 'crosshair'
                : 'default',
        }}
      >
        {/* Gradient wash: the user's theme-pad stops tint the canvas, Arc-window style; intensity + grain come from the theme device; sits under the dot grid. */}
        {washStops && washStops.length > 0 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: washBackgroundUrl(washStops, washOpacity),
              backgroundSize: '100% 100%',
            }}
          />
        )}
        {grain > 0 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: grain,
              backgroundImage: GRAIN_URL,
            }}
          />
        )}

        {/* Dot grid background; gestures move it imperatively via gridRef (phase + scale), commits re-render it here (dot radius included). The tile is an SVG IMAGE, not a procedural gradient: Chromium caches a decoded image as a GPU texture, while a radial-gradient re-rasterizes the whole layer every backgroundSize change, and under GPU memory pressure (many webviews, external monitors) those rasters get dropped and paint as a giant blank rectangle, the 1.5.9 white-patch bug. Same backgroundSize/Position write contract, so the per-frame camera writer is untouched. */}
        <Box
          ref={canvas.gridRef}
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            // Arc fullscreen: the float sits on a clean themed ground, the dot texture is canvas-only.
            display: anyFullscreen ? 'none' : undefined,
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
              `<svg xmlns='http://www.w3.org/2000/svg' width='${dotSpacing}' height='${dotSpacing}'><circle cx='${dotSpacing / 2}' cy='${dotSpacing / 2}' r='${dotSize}' fill='${c.border.medium}'/></svg>`,
            )}")`,
            backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
            backgroundPosition: `${canvas.panX % dotSpacing}px ${canvas.panY % dotSpacing}px`,
          }}
        />

        {/* Card layer always mounts, even on an empty dashboard, so keep-alive browser cards from other dashboards stay alive; the empty-state overlays it below. */}
        {(
          <div
            ref={canvas.contentRef}
            style={{
              transform: `translate(${canvas.panX}px, ${canvas.panY}px) scale(${canvas.zoom})`,
              transformOrigin: '0 0',
              willChange: 'transform',
              position: 'relative',
            }}
          >
            {/* Tether lines between branched cards; the host alone re-renders on drag frames */}
            <TetherLayerHost inputs={tetherInputs} c={c} />
            <DashboardCardLayer
              dashboardId={dashboardId}
              cards={cards}
              viewCards={viewCards}
              browserCards={browserCards}
              keepAliveBrowserCards={keepAliveBrowserCards}
              workflowCards={workflowCards}
              workflowsHub={workflowsHub}
              outputs={outputs}
              glowingAgentCards={glowingAgentCards}
              expandedSessionIds={expandedSessionIds}
              cmdHeld={canvas.cmdHeld}
              selection={selection}
              highlightedCardId={highlightedCardId}
              autoFocusSessionId={autoFocusSessionId}
              focusedCardId={focusedCardId}
              multiDragDelta={multiDragDelta}
              shakeDirection={shakeDirection}
              spawnOriginsRef={spawnOriginsRef}
              revealSpawnedRef={revealSpawnedRef}
              measuredHeightsRef={measuredHeightsRef}
              getCanvasState={getCanvasState}
              onCardSelect={onCardSelect}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDoubleClick={onCardDoubleClick}
              onBringToFront={onBringToFront}
              onBranch={onBranch}
              onMeasuredHeight={onMeasuredHeight}
            />
          </div>
        )}
        {sessionList.length === 0 && Object.keys(viewCards).length === 0 && Object.keys(browserCards).length === 0 && Object.keys(workflowCards).length === 0 && !workflowsHub && !fullscreenCardId && (
          <DashboardEmptyState c={c} onLaunch={onToolbarSend} onStarter={onStarter} />
        )}
      </Box>

      {/* display:contents when visible so the overlays' absolute children keep positioning against the canvas root; display:none (not unmount) so the toolbar composer draft survives fullscreen. */}
      <Box sx={{ display: fullscreenCardId ? 'none' : 'contents' }}>
      <DashboardOverlays
        anyFullscreen={anyFullscreen}
        canvas={canvas}
        dashboardId={dashboardId}
        sessions={sessions}
        cards={cards}
        viewCards={viewCards}
        browserCards={browserCards}
        workflowCards={workflowCards}
        workflowsHub={workflowsHub}
        focusedCardId={focusedCardId}
        shakeDirection={shakeDirection}
        neighborDirections={neighborDirections}
        toolbarOpen={toolbarOpen}
        searchPaletteOpen={searchPaletteOpen}
        newAgentBounce={newAgentBounce}
        canvasEmpty={canvasEmpty}
        toolbarRef={toolbarRef}
        onNewAgent={onNewAgent}
        onToolbarCancel={onToolbarCancel}
        onToolbarSend={onToolbarSend}
        onAddView={onAddView}
        onHistoryResume={onHistoryResume}
        onAddBrowser={onAddBrowser}
        onNewAgentBounceEnd={onNewAgentBounceEnd}
        onFitToView={onFitToView}
        onTidy={onTidy}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={selection.selectedIds.size > 0}
        onSearchPaletteClose={onSearchPaletteClose}
        toolbarPrefill={toolbarPrefill}
        toolbarPrefillMode={toolbarPrefillMode}
      />
      </Box>

      {/* Sibling of everything: the menu used to live inside the help pill's z:10 box (so any card
          brought to front painted over it) and inside the fullscreen display:none wrapper. */}
      <CardContextMenu />
    </Box>
    </>
  );
};

export default DashboardCanvas;
