/**
 * Serialises <webview> attachment to one per frame.
 *
 * Electron attaches a guest view with a SYNCHRONOUS renderer IPC (GUEST_VIEW_MANAGER_CALL), so N
 * cards mounting together put N blocking round-trips in one frame. Measured on a real dashboard:
 * opening one with 18 cards / 8 webviews blocked the main thread for 4755ms across 40 long tasks,
 * while an idle canvas blocked for 0ms (ENG-193). Nothing here makes the attach cheaper; it just
 * stops them landing on the same frame, so the UI keeps painting between them.
 */

type Slot = () => void;

let pending: Slot[] = [];
let pumping = false;

function pump(): void {
  const next = pending.shift();
  if (!next) {
    pumping = false;
    return;
  }
  try {
    next();
  } catch {
    /* a card that blew up on attach must not stall every card behind it */
  }
  requestAnimationFrame(() => pump());
}

/**
 * Ask for the next attach slot. `onReady` fires on this frame if the queue is empty, otherwise one
 * frame per card ahead of it. Returns a cancel function for unmount before the slot arrives.
 */
export function requestWebviewAttachSlot(onReady: Slot): () => void {
  pending.push(onReady);
  if (!pumping) {
    pumping = true;
    // Start on the next frame so a burst of cards mounting in one commit all queue up first.
    requestAnimationFrame(() => pump());
  }
  return () => {
    pending = pending.filter((s) => s !== onReady);
  };
}

/** Cards waiting behind the queue right now; exposed so a test can prove the burst is serialised. */
export function pendingAttachCount(): number {
  return pending.length;
}
