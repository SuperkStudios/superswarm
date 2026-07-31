// The zone catalog the tiling MENUS render. The geometry itself lives in canvas/tiledGeometry.

export const ZONE_LABELS: Record<string, string> = {
  fill: 'Fill', left: 'Left half', right: 'Right half', top: 'Top half', bottom: 'Bottom half',
  tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right',
  t3l: 'Left third', t3c: 'Center third', t3r: 'Right third',
};

// The one grid every tiling surface renders: the green-dot hover menu and the right-click "Tile to
// zone" submenu both map this, so they can never drift apart on which zones exist.
export const TILE_GROUPS: { label: string; zones: string[] }[] = [
  { label: 'Fill and halves', zones: ['fill', 'left', 'right', 'top', 'bottom'] },
  { label: 'Quarters', zones: ['tl', 'tr', 'bl', 'br'] },
  { label: 'Thirds', zones: ['t3l', 't3c', 't3r'] },
];
