// The ONE writer of a tiled card's on-screen rect. A tiled card lives INSIDE the pan/zoom layer (so
// its webview is never remounted, which would log the user out) yet has to hold still against the
// viewport, so something must undo the camera on every frame. That job used to be split between
// React, framer-motion and an imperative !important writer, and any frame where they disagreed left
// the tile frozen at a stale camera. Now React owns only the card's SIZE, which no camera can
// change, and this module owns exactly one property, `transform`, written in the same task that
// paints the canvas itself. Two sources can no longer hold two different cameras.

export interface Camera {
  panX: number;
  panY: number;
  zoom: number;
}

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

export interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Workspace {
  x0: number;
  w: number;
  h: number;
}

// Pure layout, never the camera, so a pan/zoom frame reads nothing back out of the DOM.
let workspace: Workspace | null = null;

function measureWorkspace(): Workspace {
  const el = document.querySelector('[data-canvas-viewport]');
  const r = el?.getBoundingClientRect();
  if (!r || !(r.width > 0 && r.height > 0)) return { x0: 0, w: window.innerWidth, h: window.innerHeight };
  let x0 = 0;
  const dock = document.querySelector('[data-desktop-dock]');
  if (dock) {
    const dr = dock.getBoundingClientRect();
    // macOS model: a tiled window starts beside the Dock, never underneath it.
    if (dr.width > 0 && dr.right > r.left && dr.left < r.left + r.width * 0.25) x0 = dr.right - r.left + GAP;
  }
  return { x0, w: r.width, h: r.height };
}

// Screen-space rect (relative to the canvas viewport) that a zone occupies.
export function zoneRect(zone: string): ZoneRect | null {
  const ws = workspace ?? (workspace = measureWorkspace());
  if (zone === 'fullscreen') {
    return { x: ws.x0 + GAP, y: GAP, w: ws.w - ws.x0 - GAP * 2, h: ws.h - GAP * 2 };
  }
  const z = TILE_ZONES[zone];
  if (!z) return null;
  const usableW = ws.w - ws.x0;
  return {
    x: ws.x0 + z.x * usableW + GAP,
    y: z.y * ws.h + GAP,
    w: z.w * usableW - GAP * 2,
    h: z.h * ws.h - GAP * 2,
  };
}

interface TiledEntry {
  el: HTMLElement;
  zone: string;
  // The card's own canvas-space origin, which React keeps owning. The transform below is only the
  // delta from there to the zone, so tiling never rewrites a stored position and untiling never jumps.
  originX: number;
  originY: number;
}

const entries = new Map<string, TiledEntry>();
const workspaceListeners = new Set<() => void>();
let lastCamera: Camera = { panX: 0, panY: 0, zoom: 1 };
let observer: ResizeObserver | null = null;

function applyEntry(entry: TiledEntry, cam: Camera): void {
  const r = zoneRect(entry.zone);
  if (!r) return;
  const s = 1 / cam.zoom;
  const tx = (r.x - cam.panX) * s - entry.originX;
  const ty = (r.y - cam.panY) * s - entry.originY;
  entry.el.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
}

// Called by the canvas's one camera-to-DOM writer, in the same task as the canvas transform.
export function syncTiledGeometry(cam: Camera): void {
  lastCamera = cam;
  for (const entry of entries.values()) applyEntry(entry, cam);
}

function onWorkspaceChanged(): void {
  workspace = null;
  for (const entry of entries.values()) applyEntry(entry, lastCamera);
  workspaceListeners.forEach((fn) => fn());
}

// Lets a tiled card re-render for its new SIZE when the workspace changes shape.
export function subscribeTiledWorkspace(fn: () => void): () => void {
  workspaceListeners.add(fn);
  return () => { workspaceListeners.delete(fn); };
}

function startObserving(): void {
  if (observer) return;
  observer = new ResizeObserver(onWorkspaceChanged);
  const vp = document.querySelector('[data-canvas-viewport]');
  if (vp) observer.observe(vp);
  const dock = document.querySelector('[data-desktop-dock]');
  if (dock) observer.observe(dock);
  window.addEventListener('resize', onWorkspaceChanged);
}

function stopObserving(): void {
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', onWorkspaceChanged);
}

export function registerTiledCard(id: string, zone: string, origin: { x: number; y: number }, cam: Camera): void {
  const el = document.querySelector<HTMLElement>(`[data-select-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const entry: TiledEntry = { el, zone, originX: origin.x, originY: origin.y };
  entries.set(id, entry);
  startObserving();
  // Tiling usually commits alongside chrome collapsing, so a cached workspace is untrustworthy here.
  workspace = null;
  lastCamera = cam;
  applyEntry(entry, cam);
}

export function unregisterTiledCard(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  // Hand the property straight back to React's styles; nothing else ever wrote it.
  entry.el.style.transform = '';
  entries.delete(id);
  if (entries.size === 0) stopObserving();
}
