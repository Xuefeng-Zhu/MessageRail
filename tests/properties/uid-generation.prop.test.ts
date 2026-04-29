// Feature: messagerail-extension, Property 2: UID Determinism
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateUID, generateStreamingUID } from '../../src/utils/uid';

describe('Property 2: UID Determinism', () => {
  /**
   * **Validates: Requirements 3.5, 14.3**
   *
   * For any valid tuple of (provider, chatId, role, ordinal, text),
   * calling generateUID with the same inputs SHALL always produce
   * the same Message_UID.
   */
  it('identical input tuples always produce the same UID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant'),
        fc.nat(),
        fc.string(),
        (provider, chatId, role, ordinal, text) => {
          const uid1 = generateUID(provider, chatId, role, ordinal, text);
          const uid2 = generateUID(provider, chatId, role, ordinal, text);

          expect(uid1).toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: messagerail-extension, Property 3: UID Collision Resistance
describe('Property 3: UID Collision Resistance', () => {
  /**
   * **Validates: Requirements 14.4**
   *
   * For any two valid input tuples that differ in at least one field,
   * generateUID SHALL produce different Message_UIDs.
   */
  it('tuples differing in provider produce different UIDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant') as fc.Arbitrary<string>,
        fc.nat(),
        fc.string(),
        (provider1, provider2, chatId, role, ordinal, text) => {
          fc.pre(provider1 !== provider2);
          const uid1 = generateUID(provider1, chatId, role, ordinal, text);
          const uid2 = generateUID(provider2, chatId, role, ordinal, text);
          expect(uid1).not.toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tuples differing in chatId produce different UIDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant') as fc.Arbitrary<string>,
        fc.nat(),
        fc.string(),
        (provider, chatId1, chatId2, role, ordinal, text) => {
          fc.pre(chatId1 !== chatId2);
          const uid1 = generateUID(provider, chatId1, role, ordinal, text);
          const uid2 = generateUID(provider, chatId2, role, ordinal, text);
          expect(uid1).not.toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tuples differing in role produce different UIDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.nat(),
        fc.string(),
        (provider, chatId, ordinal, text) => {
          const uid1 = generateUID(provider, chatId, 'user', ordinal, text);
          const uid2 = generateUID(provider, chatId, 'assistant', ordinal, text);
          expect(uid1).not.toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tuples differing in ordinal produce different UIDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant') as fc.Arbitrary<string>,
        fc.nat(),
        fc.nat(),
        fc.string(),
        (provider, chatId, role, ordinal1, ordinal2, text) => {
          fc.pre(ordinal1 !== ordinal2);
          const uid1 = generateUID(provider, chatId, role, ordinal1, text);
          const uid2 = generateUID(provider, chatId, role, ordinal2, text);
          expect(uid1).not.toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tuples differing in text produce different UIDs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant') as fc.Arbitrary<string>,
        fc.nat(),
        fc.string(),
        fc.string(),
        (provider, chatId, role, ordinal, text1, text2) => {
          fc.pre(text1 !== text2);
          const uid1 = generateUID(provider, chatId, role, ordinal, text1);
          const uid2 = generateUID(provider, chatId, role, ordinal, text2);
          expect(uid1).not.toBe(uid2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: messagerail-extension, Property 11: Streaming UID Stability
describe('Property 11: Streaming UID Stability', () => {
  /**
   * **Validates: Requirements 15.4**
   *
   * For any streaming assistant message, as the message text grows
   * through successive updates, the Message_UID SHALL remain constant
   * until the message status transitions to complete. The UID is
   * derived from ordinal and role (not text checksum) during streaming.
   */
  it('streaming UID remains constant as message text grows', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.constantFrom('user', 'assistant') as fc.Arbitrary<string>,
        fc.nat(),
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 20 }),
        (provider, chatId, role, ordinal, textChunks) => {
          // Simulate streaming: text grows as chunks are appended
          let accumulatedText = '';
          const streamingUids: string[] = [];

          for (const chunk of textChunks) {
            accumulatedText += chunk;
            // During streaming, UID is generated without text checksum
            const uid = generateStreamingUID(provider, chatId, role, ordinal);
            streamingUids.push(uid);
          }

          // All streaming UIDs should be identical
          const firstUid = streamingUids[0];
          for (const uid of streamingUids) {
            expect(uid).toBe(firstUid);
          }

          // Once complete, the UID changes (includes text checksum)
          const completeUid = generateUID(provider, chatId, role, ordinal, accumulatedText);
          expect(completeUid).not.toBe(firstUid);
        }
      ),
      { numRuns: 100 }
    );
  });
});
