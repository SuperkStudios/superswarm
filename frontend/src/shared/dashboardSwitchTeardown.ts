import { getAllViewOutputIds } from '@/shared/viewWebviewRegistry';
import { getAllBrowserIds } from '@/shared/browserRegistry';
import { quiesceViewWebview } from '@/shared/viewTeardown';
import { detachBrowserCdp } from '@/shared/browserTeardown';

// Switching dashboards clears every card from the store in ONE reducer (resetLayout), so React
// unmounts all the outgoing app + browser <webview>s in a single frame. Ripping several live GPU
// surfaces out at once (app previews) or unmounting a browser with its CDP debugger still attached
// piles up "non-existent mailbox" errors and SIGSEGVs the GPU/browser process, taking the whole app
// down with no crash dump (the "navigate away and it quits itself" bug). Quiesce + detach the
// outgoing webviews ONE AT A TIME first, so only trivial surfaces are left to tear down. Bounded per
// item (the helpers self-cap), fail-open, and keep-alive browsers are skipped so they survive the
// switch with their session intact.
export async function prepareDashboardSwitch(keepBrowserIds: string[]): Promise<void> {
  const keep = new Set(keepBrowserIds);
  for (const outputId of getAllViewOutputIds()) {
    await quiesceViewWebview(outputId);
  }
  for (const browserId of getAllBrowserIds()) {
    if (keep.has(browserId)) continue;
    await detachBrowserCdp(browserId);
  }
}
