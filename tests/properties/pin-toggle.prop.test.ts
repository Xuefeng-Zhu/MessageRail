// Feature: messagerail-extension, Property 10: Pin Toggle Round-Trip

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MessageIndex } from '../../src/core/message-index';
import type { ObservedMessage } from '../../src/types';

/**
 * Helper: creates a minimal ObservedMessage with the given fields.
 */
function makeObservedMessage(
  role: 'user' | 'assistant',
  text: string
): ObservedMessage {
  return {
    nativeId: null,
    uid: '',
    role,
    text,
    status: 'complete',
    element: document.createElement('div'),
  };
}

/**
 * Arbitrary for a message role.
 */
const arbRole = fc.constantFrom<'user' | 'assistant'>('user', 'assistant');

/**
 * Arbitrary for non-empty message text.
 */
const arbMessageText = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Arbitrary for a single message descriptor with random role and text.
 */
const arbMessageDescriptor = fc.record({
  role: arbRole,
  text: arbMessageText,
});

// Feature: messagerail-extension, Property 10: Pin Toggle Round-Trip
describe('Property 10: Pin Toggle Round-Trip', () => {
  /**
   * **Validates: Requirements 9.5**
   *
   * For any indexed message, pinning it and then unpinning it SHALL result
   * in the message being unpinned and the pin record being absent from
   * storage. The message's state after pin+unpin SHALL be equivalent to
   * its state before pinning.
   */
  it('pinning then unpinning a message results in the message being unpinned and absent from getPinned()', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 messages
        fc.array(arbMessageDescriptor, { minLength: 1, maxLength: 10 }),
        async (batch) => {
          const index = new MessageIndex();
          index.setChatContext('test', 'chat-1');

          // Build and ingest ObservedMessage objects
          const messages = batch.map((m) =>
            makeObservedMessage(m.role, m.text)
          );
          index.update(messages);

          const all = index.getAll();
          // Must have at least one message to test
          expect(all.length).toBeGreaterThan(0);

          // Pick a random message index to pin/unpin (use first for determinism within each run)
          for (const target of all) {
            // Verify the message starts unpinned
            expect(target.pinned).toBe(false);

            // Pin the message
            await index.togglePin(target.uid);

            // Verify the message is now pinned
            const afterPin = index.getAll().find((m) => m.uid === target.uid);
            expect(afterPin).toBeDefined();
            expect(afterPin!.pinned).toBe(true);

            // Verify it appears in getPinned()
            const pinnedAfterPin = index.getPinned();
            const inPinned = pinnedAfterPin.find((m) => m.uid === target.uid);
            expect(inPinned).toBeDefined();

            // Unpin the message (toggle again)
            await index.togglePin(target.uid);

            // Verify the message is now unpinned
            const afterUnpin = index.getAll().find((m) => m.uid === target.uid);
            expect(afterUnpin).toBeDefined();
            expect(afterUnpin!.pinned).toBe(false);

            // Verify it does NOT appear in getPinned()
            const pinnedAfterUnpin = index.getPinned();
            const notInPinned = pinnedAfterUnpin.find((m) => m.uid === target.uid);
            expect(notInPinned).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 9.5**
   *
   * For a randomly selected message from a batch, the pin+unpin round-trip
   * leaves the message in the same state as before pinning.
   */
  it('pin+unpin round-trip restores the original unpinned state for a randomly selected message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 messages and a random index to select which message to pin
        fc.array(arbMessageDescriptor, { minLength: 1, maxLength: 10 }),
        fc.nat(),
        async (batch, rawIdx) => {
          const index = new MessageIndex();
          index.setChatContext('test', 'chat-1');

          const messages = batch.map((m) =>
            makeObservedMessage(m.role, m.text)
          );
          index.update(messages);

          const all = index.getAll();
          // Select a message using modulo to stay in bounds
          const targetIdx = rawIdx % all.length;
          const target = all[targetIdx];

          // Capture state before pinning
          const pinnedBefore = target.pinned;
          const pinnedListBefore = index.getPinned().map((m) => m.uid);

          // Pin then unpin
          await index.togglePin(target.uid);
          await index.togglePin(target.uid);

          // Verify state is restored
          const afterRoundTrip = index.getAll().find((m) => m.uid === target.uid);
          expect(afterRoundTrip).toBeDefined();
          expect(afterRoundTrip!.pinned).toBe(pinnedBefore);

          // Verify getPinned() is the same as before
          const pinnedListAfter = index.getPinned().map((m) => m.uid);
          expect(pinnedListAfter).toEqual(pinnedListBefore);
        }
      ),
      { numRuns: 100 }
    );
  });
});
