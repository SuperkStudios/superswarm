import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';

// One right-click menu for every canvas entity (chats, browsers, notes, apps, workflow cards,
// minimized pills). Cards call openCardContextMenu with their items; this overlay renders the
// native-feeling glass menu (SpacesStrip grammar) and closes on outside press / Esc / item click.
export interface CardMenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface CardMenuRequest {
  x: number;
  y: number;
  items: CardMenuItem[];
  /** Optional inline-rename affordance: shown as the first row with an editable input. */
  rename?: { value: string; onCommit: (next: string) => void };
}

const EVENT = 'openswarm:card-context-menu';

export function openCardContextMenu(e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, req: Omit<CardMenuRequest, 'x' | 'y'>): void {
  e.preventDefault();
  e.stopPropagation();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...req, x: e.clientX, y: e.clientY } }));
}

const MENU_W = 208;

function CardContextMenu(): React.ReactElement | null {
  const [menu, setMenu] = useState<CardMenuRequest | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const onOpen = (e: Event): void => {
      const req = (e as CustomEvent).detail as CardMenuRequest;
      setMenu(req);
      setRenaming(false);
      setRenameValue(req.rename?.value ?? '');
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (): void => setMenu(null);
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onDown, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onDown);
    };
  }, [menu]);

  if (!menu) return null;

  const itemSx = {
    display: 'flex', alignItems: 'center', width: '100%', px: 1.5, py: 0.75,
    border: 'none', background: 'transparent', borderRadius: '7px',
    color: 'rgba(255,255,255,0.9)', fontFamily: 'inherit', fontSize: '0.8125rem',
    cursor: 'pointer', textAlign: 'left' as const,
    '&:hover': { background: 'rgba(255,255,255,0.1)' },
    '&:disabled': { color: 'rgba(255,255,255,0.35)', cursor: 'default', '&:hover': { background: 'transparent' } },
  };

  const commitRename = (): void => {
    const trimmed = renameValue.trim();
    if (trimmed && menu.rename && trimmed !== menu.rename.value) menu.rename.onCommit(trimmed);
    setMenu(null);
  };

  return (
    <Box
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
      onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      sx={{
        position: 'fixed',
        top: Math.min(menu.y + 2, window.innerHeight - 44 * (menu.items.length + 1) - 16),
        left: Math.min(menu.x, window.innerWidth - MENU_W - 12),
        zIndex: 100001,
        width: MENU_W, p: 0.5, borderRadius: '10px',
        background: 'rgba(28,25,33,0.96)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
      }}
    >
      {menu.rename && (
        renaming ? (
          <Box
            component="input"
            autoFocus
            value={renameValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setMenu(null);
            }}
            onBlur={commitRename}
            sx={{
              width: '100%', boxSizing: 'border-box', mb: 0.25, px: 1.25, py: 0.6,
              border: '1px solid rgba(255,255,255,0.35)', borderRadius: '7px',
              background: 'rgba(0,0,0,0.35)', outline: 'none',
              color: 'rgba(255,255,255,0.95)', fontFamily: 'inherit', fontSize: '0.8125rem',
            }}
          />
        ) : (
          <Box component="button" sx={itemSx} onClick={() => setRenaming(true)}>
            Rename
          </Box>
        )
      )}
      {menu.items.map((item) => (
        <Box
          key={item.label}
          component="button"
          disabled={item.disabled}
          sx={{
            ...itemSx,
            ...(item.danger && { color: '#ff7b72', '&:hover': { background: 'rgba(255,123,114,0.12)' } }),
          }}
          onClick={() => { setMenu(null); item.onClick(); }}
        >
          {item.label}
        </Box>
      ))}
    </Box>
  );
}

export default CardContextMenu;
