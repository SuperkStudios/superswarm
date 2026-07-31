import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { setTiledCard, clearTiledCard } from '@/shared/state/dashboardLayoutSlice';
import { computeTiledStyle } from './tileZones';

// THE tiling rule set. Every card that can sit on the canvas (chat, app, browser, workflow, the
// Settings window, the Workflows window) routes through this hook, so tiling behaves identically
// everywhere. Modelled on macOS Sequoia window tiling / Rectangle / Magnet:
//   1. `tiledCards[cardId]` is the ONLY tiling state: one zone per card, 'fullscreen' included.
//   2. Tiling never writes card geometry, so leaving a tile always lands back on the pre-tile frame.
//   3. A tiled card re-tiles straight to another zone; there is no restore step in between.
//   4. Dragging a tiled card untiles it at its pre-tile SIZE and keeps the pointer's grip on it.
//   5. Resizing a tiled card untiles it and continues from the tiled rect, so the new size sticks.
//   6. Minimizing keeps the zone (the rail puts you back in it); only 'fullscreen' is dropped, since
//      a parked card must not keep hiding the whole shell.
//   7. Closing a card drops its zone (the reducers own that; an orphan entry poisons every reader).

export interface CardFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CardTilingArgs {
  cardId: string;
  getCanvasState: () => { panX: number; panY: number; zoom: number };
  /** The card's own position reducer; a drag-untile writes the popped-out origin through it. */
  commitPosition: (x: number, y: number) => void;
}

export interface CardTiling {
  zone: string | undefined;
  isTiled: boolean;
  isFullscreen: boolean;
  /** A TILE_ZONES key, 'fullscreen', or 'restore'. */
  applyZone: (zone: string) => void;
  /** Title-bar press: pops a tiled card out under the cursor at its pre-tile size. Null if untiled. */
  untileForDrag: (clientX: number, clientY: number, preTileWidth: number) => { x: number; y: number } | null;
  /** Resize-handle press: breaks the tile, handing back the rect the card was occupying. Null if untiled. */
  untileForResize: () => CardFrame | null;
}

export function useCardTiling({ cardId, getCanvasState, commitPosition }: CardTilingArgs): CardTiling {
  const dispatch = useAppDispatch();
  const zone = useAppSelector((s) => s.dashboardLayout.tiledCards[cardId]);

  const applyZone = useCallback((next: string): void => {
    if (next === 'restore') dispatch(clearTiledCard(cardId));
    else dispatch(setTiledCard({ cardId, zone: next }));
  }, [dispatch, cardId]);

  // The rect a tiled card occupies, in canvas coords. computeTiledStyle sizes in SCREEN px (the card
  // is counter-scaled by 1/zoom), so the footprint has to come back through the zoom.
  const tiledFrame = useCallback((): CardFrame | null => {
    if (!zone) return null;
    const cam = getCanvasState();
    const style = computeTiledStyle(zone, cam.panX, cam.panY, cam.zoom);
    if (!style) return null;
    return { x: style.left, y: style.top, w: style.width / cam.zoom, h: style.height / cam.zoom };
  }, [zone, getCanvasState]);

  const untileForResize = useCallback((): CardFrame | null => {
    const frame = tiledFrame();
    if (!frame) return null;
    dispatch(clearTiledCard(cardId));
    return frame;
  }, [tiledFrame, dispatch, cardId]);

  const untileForDrag = useCallback((clientX: number, clientY: number, preTileWidth: number): { x: number; y: number } | null => {
    const frame = tiledFrame();
    if (!frame) return null;
    const cam = getCanvasState();
    const vp = document.querySelector('[data-canvas-viewport]')?.getBoundingClientRect();
    const pointerX = (clientX - (vp?.left ?? 0) - cam.panX) / cam.zoom;
    // macOS: the window snaps back to its pre-tile width but stays glued to where you grabbed it.
    const grip = frame.w > 0 ? Math.min(Math.max((pointerX - frame.x) / frame.w, 0), 1) : 0;
    const x = pointerX - grip * preTileWidth;
    dispatch(clearTiledCard(cardId));
    // Commit before the drag starts, so a press-and-release with no movement leaves the card popped
    // out where it appeared instead of teleporting back to its stored spot.
    commitPosition(x, frame.y);
    return { x, y: frame.y };
  }, [tiledFrame, getCanvasState, dispatch, cardId, commitPosition]);

  return { zone, isTiled: !!zone, isFullscreen: zone === 'fullscreen', applyZone, untileForDrag, untileForResize };
}
