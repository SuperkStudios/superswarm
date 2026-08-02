import { bringToFront, recordClosedCard, removeCard, removeWorkflowCard } from '@/shared/state/dashboardLayoutSlice';
import { closeSession } from '@/shared/state/agentsSlice';
import { removeBrowserCardCleanly } from '@/shared/browserTeardown';
import { removeViewCardCleanly } from '@/shared/viewTeardown';
import type { AppDispatch } from '@/shared/state/store';
import type { CardMenuRow } from './openCardContextMenu';
import type { DockEntry } from './dockEntries';

export function dockTileMenuRows(entry: DockEntry, dispatch: AppDispatch, onFocus: () => void): CardMenuRow[] {
  return [
    { label: 'Show on canvas', onClick: onFocus },
    { label: 'Bring to front', onClick: () => dispatch(bringToFront({ id: entry.id, type: entry.kind })) },
    { kind: 'separator' },
    {
      label: 'Close',
      danger: true,
      onClick: () => {
        if (entry.kind === 'browser') { dispatch(recordClosedCard({ kind: 'browser', id: entry.id })); void removeBrowserCardCleanly(entry.id, dispatch); return; }
        if (entry.kind === 'view') { dispatch(recordClosedCard({ kind: 'view', id: entry.id })); void removeViewCardCleanly(entry.id, dispatch); return; }
        if (entry.kind === 'workflow') { dispatch(recordClosedCard({ kind: 'workflow', id: entry.id })); dispatch(removeWorkflowCard(entry.id)); return; }
        dispatch(recordClosedCard({ kind: 'agent', id: entry.id }));
        dispatch(removeCard(entry.id));
        void dispatch(closeSession({ sessionId: entry.id }));
      },
    },
  ];
}
