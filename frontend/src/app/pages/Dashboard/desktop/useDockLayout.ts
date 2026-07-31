import React, { useCallback, useEffect, useRef, useState } from 'react';

const TILE_MAX = 30;
const TILE_MIN = 18;
const ROOT_PAD = 7;
const GAP_RATIO = 0.3;
const GAP_MIN = 3;
const ICON_RATIO = 0.58;
// Breathing room above and below the dock; the canvas root clips overflow, so this is also the magnify headroom.
const EDGE_MARGIN = 16;
// Slack inside the scroll box so a magnified tile grows past the column without the scroll clip cutting it.
const BLEED = 14;
const BOOST = 0.5;
// The bell curve was hand-tuned as 44px against a 30px tile; keep that ratio so it narrows as tiles shrink.
const FALLOFF_RATIO = 44 / 30;

export interface DockLayoutInput {
  cardCount: number;
  actionCount: number;
  dividerCount: number;
}

export interface DockLayout {
  dockRef: React.MutableRefObject<HTMLDivElement | null>;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  tile: number;
  gap: number;
  iconSize: number;
  scrolls: boolean;
  scrollHeight: number;
  bleed: number;
  applyMagnify: (clientY: number | null) => void;
}

function gapFor(tile: number): number {
  return Math.max(GAP_MIN, Math.round(tile * GAP_RATIO));
}

function columnHeight(tile: number, tiles: number, dividers: number): number {
  const gaps = Math.max(0, tiles + dividers - 1);
  return ROOT_PAD * 2 + tiles * tile + dividers + gaps * gapFor(tile);
}

/** macOS Dock sizing: tiles shrink to fit the column and only scroll once they hit the floor. */
export function useDockLayout({ cardCount, actionCount, dividerCount }: DockLayoutInput): DockLayout {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerH, setContainerH] = useState<number>(() => window.innerHeight);

  useEffect(() => {
    const host = dockRef.current?.parentElement;
    if (!host) return undefined;
    const measure = (): void => setContainerH(host.clientHeight || window.innerHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const tileCount = cardCount + actionCount;
  const budget = Math.max(TILE_MIN * 6, containerH - EDGE_MARGIN * 2);
  const guess = Math.floor(
    (budget - ROOT_PAD * 2 - dividerCount) /
      (tileCount + GAP_RATIO * Math.max(0, tileCount + dividerCount - 1)),
  );
  let tile = Math.min(TILE_MAX, Math.max(TILE_MIN, Number.isFinite(guess) ? guess : TILE_MAX));
  while (tile > TILE_MIN && columnHeight(tile, tileCount, dividerCount) > budget) tile -= 1;
  const gap = gapFor(tile);
  const scrolls = columnHeight(tile, tileCount, dividerCount) > budget;

  // Pinned rows keep their full height; whatever is left is what the card column may occupy.
  const pinned = ROOT_PAD * 2 + dividerCount + actionCount * tile + (dividerCount + actionCount) * gap;
  const scrollHeight = Math.max(tile * 3 + gap * 2 + BLEED * 2, budget - pinned);

  const tileRef = useRef(tile);
  tileRef.current = tile;

  // macOS Dock magnification: the tile under the cursor grows on a bell curve and its neighbors SLIDE
  // AWAY to make room. Each tile that grows by `extra` pushes every tile past it by extra/2.
  const applyMagnify = useCallback((clientY: number | null) => {
    const root = dockRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('.osw-dock-tile'));
    if (els.length === 0) return;
    if (clientY == null) {
      els.forEach((t) => { t.style.transform = ''; t.style.zIndex = ''; });
      return;
    }
    const size = tileRef.current;
    const falloff = size * FALLOFF_RATIO;
    const box = scrollRef.current;
    const boxShift = box ? box.offsetTop - box.scrollTop : 0;
    const cy = clientY - root.getBoundingClientRect().top;
    const bases = els.map((t) => (box?.contains(t) ? boxShift : 0) + t.offsetTop + t.offsetHeight / 2);
    const scales = bases.map((b) => 1 + BOOST * Math.exp(-(((cy - b) / falloff) ** 2)));
    const extra = scales.map((s) => size * (s - 1));
    els.forEach((t, i) => {
      let shift = 0;
      for (let j = 0; j < els.length; j++) {
        if (j === i) continue;
        shift += (extra[j] / 2) * Math.sign(bases[i] - bases[j]);
      }
      t.style.transform = `translateY(${shift.toFixed(1)}px) scale(${scales[i].toFixed(3)})`;
      t.style.transformOrigin = 'left center';
      t.style.zIndex = String(10 + Math.round((scales[i] - 1) * 100));
    });
  }, []);

  return {
    dockRef,
    scrollRef,
    tile,
    gap,
    iconSize: Math.round(tile * ICON_RATIO),
    scrolls,
    scrollHeight,
    bleed: BLEED,
    applyMagnify,
  };
}
