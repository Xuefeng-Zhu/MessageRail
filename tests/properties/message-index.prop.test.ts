// Feature: messagerail-extension, Property 6: Ordinal Assignment Stability
// Feature: messagerail-extension, Property 7: Message Deduplication
// Feature: messagerail-extension, Property 9: Search Filter Correctness

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { MessageIndex } from '../../src/core/message-index';
import type { ObservedMessage } from '../../src/types';
import { normalizeText } from '../../src/utils/normalize';

/**
 * Helper: creates a minimal ObservedMessage with the given fields.
 */
function makeObservedMessage(
  role: 'user' | 'assistant',
  text: string,
  overrides?: Partial<ObservedMessage>
): ObservedMessage {
  return {
    nativeId: null,
    uid: '',
    role,
    text,
    status: 'complete',
    element: document.createElement('div'),
    ...overrides,
  };
}

/**
 * Arbitrary for a message role.
 */
const arbRole = fc.constantFrom<'user' | 'assistant'>('user', 'assistant');

/**
 * Arbitrary for a non-empty message text (avoids empty strings which
 * would all normalize to the same value and share UIDs).
 */
const arbMessageText = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Arbitrary for a single ObservedMessage with random role and text.
 */
const arbObservedMessage: fc.Arbitrary<{ role: 'user' | 'assistant'; text: string }> =
  fc.record({
    role: arbRole,
    text: arbMessageText,
  });

// Feature: messagerail-extension, Property 6: Ordinal Assignment Stability
describe('Property 6: Ordinal Assignment Stability', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   *
   * For any sequence of message batches ingested into the MessageIndex,
   * ordinals SHALL be assigned sequentially starting from 1, and existing
   * message ordinals SHALL never change when new messages are added.
   */
  it('ordinals are sequential from 1 and stable when new messages are added', () => {
    fc.assert(
      fc.property(
        // Generate an initial batch of 1-10 messages
        fc.array(arbObservedMessage, { minLength: 1, maxLength: 10 }),
        // Generate additional messages to append (0-5)
        fc.array(arbObservedMessage, { minLength: 1, maxLength: 5 }),
        (initialBatch, additionalBatch) => {
          const index = new MessageIndex();
          index.setChatContext('test', 'chat-1');

          // Build ObservedMessage objects for the initial batch
          const initialMessages = initialBatch.map((m) =>
            makeObservedMessage(m.role, m.text)
          );

          // Ingest the initial batch
          index.update(initialMessages);
          const afterFirst = index.getAll();

          // Verify ordinals are sequential from 1
          for (let i = 0; i < afterFirst.length; i++) {
            expect(afterFirst[i].ordinal).toBe(i + 1);
          }

          // Record the ordinals and UIDs of existing messages
          const existingOrdinals = afterFirst.map((m) => ({
            uid: m.uid,
            ordinal: m.ordinal,
          }));

          // Build a combined batch: original messages + new messages
          const combinedMessages = [
            ...initialMessages,
            ...additionalBatch.map((m) => makeObservedMessage(m.role, m.text)),
          ];

          // Ingest the combined batch
          index.update(combinedMessages);
          const afterSecond = index.getAll();

          // Verify ordinals are still sequential from 1
          for (let i = 0; i < afterSecond.length; i++) {
            expect(afterSecond[i].ordinal).toBe(i + 1);
          }

          // Verify existing messages retained their ordinals
          for (const existing of existingOrdinals) {
            const found = afterSecond.find((m) => m.uid === existing.uid);
            if (found) {
              expect(found.ordinal).toBe(existing.ordinal);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: messagerail-extension, Property 7: Message Deduplication
describe('Property 7: Message Deduplication', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any list of ObservedMessages (possibly containing duplicates
   * with the same Message_UID), the MessageIndex SHALL contain each
   * unique UID exactly once after ingestion.
   */
  it('each UID appears exactly once after ingesting messages with duplicates', () => {
    fc.assert(
      fc.property(
        // Generate a base list of messages
        fc.array(arbObservedMessage, { minLength: 1, maxLength: 10 }),
        (baseBatch) => {
          const index = new MessageIndex();
          index.setChatContext('test', 'chat-1');

          // Build ObservedMessage objects
          const messages = baseBatch.map((m) =>
            makeObservedMessage(m.role, m.text)
          );

          // Ingest the same batch multiple times to create duplicates
          index.update(messages);
          index.update(messages);
          index.update(messages);

          const all = index.getAll();

          // Collect all UIDs
          const uids = all.map((m) => m.uid);
          const uniqueUids = new Set(uids);

          // Each UID should appear exactly once
          expect(uids.length).toBe(uniqueUids.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: messagerail-extension, Property 9: Search Filter Correctness
describe('Property 9: Search Filter Correctness', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any list of IndexedMessages and for any non-empty search query
   * string, the search method SHALL return exactly those messages whose
   * normalized text contains the query as a case-insensitive substring —
   * no false positives and no false negatives.
   */
  it('search returns exactly those messages whose normalized text contains the query', () => {
    fc.assert(
      fc.property(
        // Generate a list of messages
        fc.array(arbObservedMessage, { minLength: 1, maxLength: 15 }),
        // Generate a non-empty search query
        fc.string({ minLength: 1, maxLength: 20 }),
        (batch, query) => {
          const index = new MessageIndex();
          index.setChatContext('test', 'chat-1');

          const messages = batch.map((m) =>
            makeObservedMessage(m.role, m.text)
          );

          index.update(messages);
          const all = index.getAll();
          const results = index.search(query);

          const lowerQuery = query.toLowerCase();

          // Compute the expected set: messages whose normalized text
          // contains the query as a case-insensitive substring
          const expected = all.filter((m) =>
            m.text.toLowerCase().includes(lowerQuery)
          );

          // No false negatives: every expected message is in results
          for (const msg of expected) {
            const found = results.find((r) => r.uid === msg.uid);
            expect(found).toBeDefined();
          }

          // No false positives: every result is in the expected set
          for (const msg of results) {
            const found = expected.find((e) => e.uid === msg.uid);
            expect(found).toBeDefined();
          }

          // Same count
          expect(results.length).toBe(expected.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
