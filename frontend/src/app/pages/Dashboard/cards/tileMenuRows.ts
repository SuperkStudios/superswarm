import type { CardMenuRow } from '../desktop/openCardContextMenu';

// The green-dot tiling grid, spelled out as words for the keyboard/right-click path.
const ZONE_LABELS: Record<string, string> = {
  fill: 'Fill',
  left: 'Left half',
  right: 'Right half',
  top: 'Top half',
  bottom: 'Bottom half',
  tl: 'Top left',
  tr: 'Top right',
  bl: 'Bottom left',
  br: 'Bottom right',
  t3l: 'Left third',
  t3c: 'Center third',
  t3r: 'Right third',
};

const GROUPS: { label: string; zones: string[] }[] = [
  { label: 'Fill and halves', zones: ['fill', 'left', 'right', 'top', 'bottom'] },
  { label: 'Quarters', zones: ['tl', 'tr', 'bl', 'br'] },
  { label: 'Thirds', zones: ['t3l', 't3c', 't3r'] },
];

export function tileMenuRows(onTile: (zone: string) => void, currentZone?: string): CardMenuRow[] {
  const rows: CardMenuRow[] = [];
  for (const group of GROUPS) {
    rows.push({ kind: 'header', label: group.label });
    for (const zone of group.zones) {
      rows.push({ label: ZONE_LABELS[zone], checked: currentZone === zone, onClick: () => onTile(zone) });
    }
  }
  return rows;
}
