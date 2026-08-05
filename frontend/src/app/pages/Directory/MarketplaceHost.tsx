import React, { useEffect, useState } from 'react';
import DirectoryDialog, { DirectoryTab } from './DirectoryDialog';

export const MARKETPLACE_OPEN_EVENT = 'openswarm:open-marketplace';

export function openMarketplace(tab: DirectoryTab = 'skills'): void {
  window.dispatchEvent(new CustomEvent(MARKETPLACE_OPEN_EVENT, { detail: { tab } }));
}

// Shell-global Directory mount: the marketplace is its own surface (dock tile, launcher), not just a settings drill-down.
const MarketplaceHost: React.FC = () => {
  const [openTab, setOpenTab] = useState<DirectoryTab | null>(null);
  useEffect(() => {
    const onOpen = (e: Event): void => setOpenTab(((e as CustomEvent).detail?.tab as DirectoryTab) ?? 'skills');
    window.addEventListener(MARKETPLACE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MARKETPLACE_OPEN_EVENT, onOpen);
  }, []);
  if (!openTab) return null;
  return <DirectoryDialog open initialTab={openTab} onClose={() => setOpenTab(null)} />;
};

export default MarketplaceHost;
