// ENG-176: the transcript belongs to the field the user was in when they STARTED speaking.
// Run: node --test --experimental-strip-types frontend/src/shared/voice/injectTargetSnapshot.test.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setInjectSnapshot, clearInjectSnapshot, takeInjectSnapshot, isUsableTarget } from './injectTargetSnapshot.ts';

const field = (connected = true) => ({ tagName: 'TEXTAREA', isConnected: connected, isContentEditable: false }) as unknown as HTMLElement;

beforeEach(() => clearInjectSnapshot());

test('the snapshotted field wins over whatever is focused later', () => {
  const a = field();
  setInjectSnapshot({ el: a, browserId: null });
  assert.equal(takeInjectSnapshot().el, a);
});

test('a detached field is refused so injection falls back to live focus', () => {
  setInjectSnapshot({ el: field(false), browserId: null });
  assert.equal(takeInjectSnapshot().el, null);
});

test('a non-typeable element never wins', () => {
  assert.equal(isUsableTarget({ tagName: 'DIV', isConnected: true, isContentEditable: false } as unknown as HTMLElement), false);
  assert.equal(isUsableTarget({ tagName: 'DIV', isConnected: true, isContentEditable: true } as unknown as HTMLElement), true);
  assert.equal(isUsableTarget({ tagName: 'WEBVIEW', isConnected: true, isContentEditable: false } as unknown as HTMLElement), true);
});

test('taking consumes it, so one take can never leak into the next', () => {
  setInjectSnapshot({ el: field(), browserId: 'b1' });
  assert.equal(takeInjectSnapshot().browserId, 'b1');
  assert.equal(takeInjectSnapshot().el, null);
  assert.equal(takeInjectSnapshot().browserId, null);
});

test('a cancelled take leaves nothing behind', () => {
  setInjectSnapshot({ el: field(), browserId: 'b2' });
  clearInjectSnapshot();
  assert.equal(takeInjectSnapshot().el, null);
});
