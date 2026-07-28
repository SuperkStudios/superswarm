import React from 'react';

// macOS-style tiling zones (fractions of the workspace) + the math to render a tiled card at a
// screen-space viewport region WITHOUT leaving the transformed canvas layer, so a browser/app
// card's webview is never remounted (which would log the user out). The card stays a child of the
// pan/zoom layer; we counter-transform (scale 1/zoom) and place it in canvas coords so it lands
// pixel-exact at the viewport region at 100% content scale. Recompute on pan/zoom to stay put.

export const TILE_ZONES: Record<string, { x: number; y: number; w: number; h: number }> = {
  fill:   { x: 0,     y: 0,   w: 1,     h: 1 },
  left:   { x: 0,     y: 0,   w: 0.5,   h: 1 },
  right:  { x: 0.5,   y: 0,   w: 0.5,   h: 1 },
  top:    { x: 0,     y: 0,   w: 1,     h: 0.5 },
  bottom: { x: 0,     y: 0.5, w: 1,     h: 0.5 },
  tl:     { x: 0,     y: 0,   w: 0.5,   h: 0.5 },
  tr:     { x: 0.5,   y: 0,   w: 0.5,   h: 0.5 },
  bl:     { x: 0,     y: 0.5, w: 0.5,   h: 0.5 },
  br:     { x: 0.5,   y: 0.5, w: 0.5,   h: 0.5 },
  t3l:    { x: 0,     y: 0,   w: 1 / 3, h: 1 },
  t3c:    { x: 1 / 3, y: 0,   w: 1 / 3, h: 1 },
  t3r:    { x: 2 / 3, y: 0,   w: 1 / 3, h: 1 },
};

// macOS Sequoia leaves a small gap between tiled windows; we match it.
const GAP = 8;

export interface TiledStyle {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  transformOrigin: string;
}

// The workspace = the canvas viewport element (already below the app header, dock floats over it),
// measured live so we never hardcode chrome sizes that drift. Its screen origin cancels out of the
// math below because the card shares the viewport's coordinate system, so we only need its size.
function workspaceSize(): { w: number; h: number } {
  const el = document.querySelector('[data-canvas-viewport]');
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

export function computeTiledStyle(zone: string, panX: number, panY: number, zoom: number): TiledStyle | null {
  // 'fullscreen' = the card expands into the ENTIRE dashboard, floating on the same gap the tile
  // zones use. Anchored to the VIEWPORT (not the window) so docked chrome, like the pinned sidebar,
  // squeezes the card instead of being covered by it (the canvas viewport shrinks with the sidebar).
  if (zone === 'fullscreen') {
    const { w: vpW, h: vpH } = workspaceSize();
    return {
      left: (GAP - panX) / zoom,
      top: (GAP - panY) / zoom,
      width: vpW - GAP * 2,
      height: vpH - GAP * 2,
      transform: `scale(${1 / zoom})`,
      transformOrigin: 'top left',
    };
  }
  const z = TILE_ZONES[zone];
  if (!z) return null;
  const { w: vpW, h: vpH } = workspaceSize();
  // Screen region (vpX + GAP, vpY + GAP, ...) converted to canvas coords: card lives inside the
  // pan/zoom layer, so screen = viewportOrigin + pan + canvasPos*zoom, and viewportOrigin cancels.
  return {
    left: (z.x * vpW + GAP - panX) / zoom,
    top: (z.y * vpH + GAP - panY) / zoom,
    width: z.w * vpW - GAP * 2,
    height: z.h * vpH - GAP * 2,
    transform: `scale(${1 / zoom})`,
    transformOrigin: 'top left',
  };
}

// Tiled geometry depends on live DOM measurements, so re-render when the workspace resizes:
// the chrome collapsing on fullscreen-enter, a window resize, a banner appearing. The initial
// ResizeObserver fire also re-measures right after the same-commit layout change that set the zone.
export function useTiledStyle(
  zone: string | undefined,
  panX: number,
  panY: number,
  zoom: number,
  // Live sync: with these, every camera write restyles the card element IN THE SAME TASK as the
  // canvas transform. The React path alone lands a commit behind the compositor, so tiled cards
  // visibly wobbled against the viewport on every zoom/pan frame.
  getLive?: () => { panX: number; panY: number; zoom: number },
  selectId?: string,
): TiledStyle | null {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!zone) return undefined;
    const el = document.querySelector('[data-canvas-viewport]');
    const ro = new ResizeObserver(() => bump());
    if (el) ro.observe(el);
    const onResize = (): void => bump();
    window.addEventListener('resize', onResize);
    // The chrome collapse commits in the same flush that set the zone, so the first compute
    // measures the pre-collapse viewport; re-measure after layout settles. Timeouts, not rAF:
    // rAF (and ResizeObserver delivery, which rides it) freezes in non-focused tabs.
    // 700ms outlives the banner Collapse (350ms) plus easing tail; RO covers focused tabs live.
    const timers = [60, 250, 700].map((ms) => window.setTimeout(() => bump(), ms));
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); timers.forEach((t) => window.clearTimeout(t)); };
  }, [zone]);
  React.useEffect(() => {
    if (!zone || !getLive || !selectId) return undefined;
    const el = document.querySelector(`[data-select-id="${CSS.escape(selectId)}"]`) as HTMLElement | null;
    if (!el) return undefined;
    // left/top belong on whichever element OWNS position: AgentCard splits into a position:absolute
    // motion wrapper around a position:relative inner Box (writing left/top on the inner Box ADDS to
    // the wrapper's, rendering the tile at exactly double the offset); Browser/View cards are one
    // element. Size + counter-scale always live on the select-id element, mirroring the sx path.
    const posEl = getComputedStyle(el).position === 'absolute' || getComputedStyle(el).position === 'fixed'
      ? el
      : (el.parentElement as HTMLElement | null) ?? el;
    const posProps = ['left', 'top'];
    const sizeProps = ['width', 'height', 'transform', 'transform-origin'];
    const clearAll = (): void => {
      posProps.forEach((pr) => posEl.style.removeProperty(pr));
      sizeProps.forEach((pr) => el.style.removeProperty(pr));
    };
    const apply = (): void => {
      // A parked card (kept alive off-screen / minimized) must keep its sx parking position.
      if (el.getAttribute('data-keepalive-hidden') === '1') { clearAll(); return; }
      const cam = getLive();
      const s = computeTiledStyle(zone, cam.panX, cam.panY, cam.zoom);
      if (!s) return;
      // 'important' so framer-motion's own left/top writes (computed off the LAGGING React-committed
      // camera) can't land after us and shift the tile by the stale-camera delta.
      posEl.style.setProperty('left', `${s.left}px`, 'important');
      posEl.style.setProperty('top', `${s.top}px`, 'important');
      el.style.setProperty('width', `${s.width}px`, 'important');
      el.style.setProperty('height', `${s.height}px`, 'important');
      el.style.setProperty('transform', s.transform, 'important');
      el.style.setProperty('transform-origin', s.transformOrigin, 'important');
    };
    apply();
    window.addEventListener('openswarm:canvas-pan-changed', apply);
    window.addEventListener('resize', apply);
    // The workspace can change size WITHOUT a window resize (chrome collapsing on fullscreen-enter,
    // a banner appearing). These inline writes OVERRIDE the class styles, so they must re-measure on
    // the same signals the React path uses or the tile keeps the pre-collapse viewport (the
    // fullscreen card that stopped short of the bottom edge).
    const vp = document.querySelector('[data-canvas-viewport]');
    const ro = new ResizeObserver(apply);
    if (vp) ro.observe(vp);
    const timers = [60, 250, 700].map((ms) => window.setTimeout(apply, ms));
    // animateTo moves the camera WITHOUT emitting pan-changed, and the important-priority writes
    // above block React's late self-heal, so a tiled card must track the live camera itself:
    // a write-on-change rAF loop (frozen while hidden is fine; nothing moves visually then).
    let raf = 0;
    let lastKey = '';
    const tick = (): void => {
      const cam = getLive();
      const size = workspaceSize();
      const key = `${cam.panX}:${cam.panY}:${cam.zoom}:${size.w}:${size.h}`;
      if (key !== lastKey) { lastKey = key; apply(); }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('openswarm:canvas-pan-changed', apply);
      window.removeEventListener('resize', apply);
      ro.disconnect();
      timers.forEach((tm) => window.clearTimeout(tm));
      window.cancelAnimationFrame(raf);
      clearAll();
    };
  }, [zone, getLive, selectId]);
  return zone ? computeTiledStyle(zone, panX, panY, zoom) : null;
}
