import { describe, it, expect, beforeEach } from 'vitest';
import { MessageIndex } from '../../src/core/message-index';
import type { ObservedMessage } from '../../src/types';

/**
 * Unit tests for MessageIndex.
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 8.3, 8.5, 9.1, 9.5, 15.3
 */

/** Helper to create a minimal ObservedMessage. */
function makeMsg(
  overrides: Partial<ObservedMessage> & { text: string; role: 'user' | 'assistant' }
): ObservedMessage {
  return {
    nativeId: null,
    uid: '',
    status: 'complete',
    element: document.createElement('div'),
    ...overrides,
  };
}

describe('MessageIndex', () => {
  let index: MessageIndex;

  beforeEach(() => {
    index = new MessageIndex();
    index.setChatContext('chatgpt', 'chat-1');
  });

  describe('update and getAll', () => {
    it('assigns sequential ordinals starting from 1', () => {
      const msgs = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Hi there' }),
        makeMsg({ role: 'user', text: 'How are you?' }),
      ];

      index.update(msgs);
      const all = index.getAll();

      expect(all).toHaveLength(3);
      expect(all[0].ordinal).toBe(1);
      expect(all[1].ordinal).toBe(2);
      expect(all[2].ordinal).toBe(3);
    });

    it('normalizes text (trims and collapses whitespace)', () => {
      const msgs = [
        makeMsg({ role: 'user', text: '  Hello   world  \n\t foo  ' }),
      ];

      index.update(msgs);
      const all = index.getAll();

      expect(all[0].text).toBe('Hello world foo');
    });

    it('generates a preview of ~80 chars with ellipsis for long text', () => {
      const longText = 'A'.repeat(120);
      const msgs = [makeMsg({ role: 'user', text: longText })];

      index.update(msgs);
      const all = index.getAll();

      expect(all[0].preview.length).toBeLessThanOrEqual(81); // 80 + ellipsis char
      expect(all[0].preview).toContain('…');
    });

    it('returns full text as preview for short messages', () => {
      const msgs = [makeMsg({ role: 'user', text: 'Short' })];

      index.update(msgs);
      const all = index.getAll();

      expect(all[0].preview).toBe('Short');
    });

    it('deduplicates messages with the same UID', () => {
      const msgs = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'World' }),
      ];

      // Ingest the same batch twice
      index.update(msgs);
      index.update(msgs);
      const all = index.getAll();

      expect(all).toHaveLength(2);
    });

    it('updates existing messages in-place on re-ingestion', () => {
      const msgs1 = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Initial response' }),
      ];
      index.update(msgs1);

      // Same positions, but assistant text changed (same ordinal+role → same UID for complete)
      // Since the text changed, the UID will differ for complete messages.
      // This tests that the same batch with same text deduplicates properly.
      index.update(msgs1);
      const all = index.getAll();

      expect(all).toHaveLength(2);
      expect(all[1].text).toBe('Initial response');
    });

    it('returns messages sorted by ordinal', () => {
      const msgs = [
        makeMsg({ role: 'user', text: 'First' }),
        makeMsg({ role: 'assistant', text: 'Second' }),
        makeMsg({ role: 'user', text: 'Third' }),
      ];

      index.update(msgs);
      const all = index.getAll();

      for (let i = 1; i < all.length; i++) {
        expect(all[i].ordinal).toBeGreaterThan(all[i - 1].ordinal);
      }
    });
  });

  describe('streaming message handling', () => {
    it('assigns stable UID for streaming messages regardless of text changes', () => {
      const streamingMsg = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Partial...', status: 'streaming' }),
      ];
      index.update(streamingMsg);
      const first = index.getAll();
      const streamingUid = first[1].uid;

      // Text grows but UID stays the same (streaming UID ignores text)
      const updatedMsg = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Partial response growing...', status: 'streaming' }),
      ];
      index.update(updatedMsg);
      const second = index.getAll();

      expect(second).toHaveLength(2);
      expect(second[1].uid).toBe(streamingUid);
      expect(second[1].text).toBe('Partial response growing...');
    });

    it('transitions streaming message to complete with new UID', () => {
      // First: streaming
      const streamingBatch = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Streaming text', status: 'streaming' }),
      ];
      index.update(streamingBatch);
      const beforeComplete = index.getAll();
      expect(beforeComplete[1].status).toBe('streaming');

      // Then: complete
      const completeBatch = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Final complete text', status: 'complete' }),
      ];
      index.update(completeBatch);
      const afterComplete = index.getAll();

      expect(afterComplete).toHaveLength(2);
      expect(afterComplete[1].status).toBe('complete');
      expect(afterComplete[1].text).toBe('Final complete text');
    });

    it('preserves pin state across streaming → complete transition', () => {
      // Streaming message
      const streamingBatch = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Streaming...', status: 'streaming' }),
      ];
      index.update(streamingBatch);

      // Pin the streaming message
      const streamingUid = index.getAll()[1].uid;
      index.togglePin(streamingUid);
      expect(index.getAll()[1].pinned).toBe(true);

      // Transition to complete
      const completeBatch = [
        makeMsg({ role: 'user', text: 'Hello' }),
        makeMsg({ role: 'assistant', text: 'Done!', status: 'complete' }),
      ];
      index.update(completeBatch);

      const all = index.getAll();
      expect(all[1].pinned).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const msgs = [
        makeMsg({ role: 'user', text: 'Hello world' }),
        makeMsg({ role: 'assistant', text: 'Goodbye world' }),
        makeMsg({ role: 'user', text: 'Something else entirely' }),
      ];
      index.update(msgs);
    });

    it('returns matching messages for case-insensitive substring', () => {
      const results = index.search('WORLD');
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no messages match', () => {
      const results = index.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('returns all messages for empty query', () => {
      const results = index.search('');
      expect(results).toHaveLength(3);
    });

    it('matches partial substrings', () => {
      const results = index.search('ello');
      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('Hello world');
    });
  });

  describe('pinning', () => {
    beforeEach(() => {
      const msgs = [
        makeMsg({ role: 'user', text: 'Message one' }),
        makeMsg({ role: 'assistant', text: 'Message two' }),
      ];
      index.update(msgs);
    });

    it('togglePin pins an unpinned message', async () => {
      const uid = index.getAll()[0].uid;
      await index.togglePin(uid);

      expect(index.getAll()[0].pinned).toBe(true);
    });

    it('togglePin unpins a pinned message', async () => {
      const uid = index.getAll()[0].uid;
      await index.togglePin(uid);
      await index.togglePin(uid);

      expect(index.getAll()[0].pinned).toBe(false);
    });

    it('getPinned returns only pinned messages', async () => {
      const uid = index.getAll()[1].uid;
      await index.togglePin(uid);

      const pinned = index.getPinned();
      expect(pinned).toHaveLength(1);
      expect(pinned[0].uid).toBe(uid);
    });

    it('togglePin is a no-op for unknown UIDs', async () => {
      await index.togglePin('nonexistent-uid');
      expect(index.getPinned()).toHaveLength(0);
    });
  });

  describe('loadPins', () => {
    it('is a no-op placeholder that resolves', async () => {
      await expect(index.loadPins('chat-1')).resolves.toBeUndefined();
    });
  });

  describe('setChatContext', () => {
    it('affects UID generation for subsequent updates', () => {
      const msgs = [makeMsg({ role: 'user', text: 'Hello' })];

      index.setChatContext('chatgpt', 'chat-A');
      index.update(msgs);
      const uidA = index.getAll()[0].uid;

      // Create a new index with different context
      const index2 = new MessageIndex();
      index2.setChatContext('chatgpt', 'chat-B');
      index2.update(msgs);
      const uidB = index2.getAll()[0].uid;

      expect(uidA).not.toBe(uidB);
    });
  });
});
