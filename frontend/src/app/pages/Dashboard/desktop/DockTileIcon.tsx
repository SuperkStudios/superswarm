import React, { useState } from 'react';
import Box from '@mui/material/Box';
import type { DockEntry } from './dockEntries';

/** A tile shows its site favicon OR the generic glyph, never the glyph peeking out from behind the favicon. */
export function DockTileIcon({ entry }: { entry: DockEntry }): React.ReactElement {
  const [faviconFailed, setFaviconFailed] = useState(false);
  if (!entry.faviconUrl || faviconFailed) return <>{entry.icon}</>;
  return (
    <Box component="img" src={entry.faviconUrl} alt="" onError={() => setFaviconFailed(true)} sx={{ borderRadius: '6px' }} />
  );
}
