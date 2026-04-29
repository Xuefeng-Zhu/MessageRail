import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBStore } from '../../src/storage/indexeddb-store';
import type { PinRecord, StoredMessage } from '../../src/types';

/**
 * Integration tests for IndexedDBStore.
 *
 * Uses fake-indexeddb to polyfill IndexedDB in the jsdom test environment.
 * Tests cover full CRUD round-trips for pins and messages, filtering by
 * chatId, and degraded-mode behavior when the database is not opened.
 *
 * Validates: Requirement 10.1
 */

function makePinRecord(overrides: Partial<PinRecord> = {}): PinRecord {
  return {
    uid: 'pin-uid-1',
    chatId: 'chat-1',
    provider: 'chatgpt',
    role: 'assistant',
    ordinal: 1,
    text: 'Hello world',
    pinnedAt: Date.now(),
    ...overrides,
  };
}

function makeStoredMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    uid: 'msg-uid-1',
    chatId: 'chat-1',
    provider: 'chatgpt',
    role: 'user',
    text: 'What is the capital of France?',
    ordinal: 1,
    status: 'complete',
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('IndexedDBStore — integration tests', () => {
  let store: IndexedDBStore;

  beforeEach(async () => {
    store = new IndexedDBStore();
    await store.open();
  });

  // ── open ──────────────────────────────────────────────────────

  describe('open', () => {
    it('creates the database successfully', async () => {
      const freshStore = new IndexedDBStore();
      // open should resolve without throwing
      await expect(freshStore.open()).resolves.toBeUndefined();
    });
  });

  // ── putPin + getPinsByChatId round-trip ────────────────────────

  describe('putPin + getPinsByChatId round-trip', () => {
    it('stores a pin and retrieves it by chatId', async () => {
      const pin = makePinRecord({ uid: 'rt-pin-1', chatId: 'chat-rt' });
      await store.putPin(pin);

      const pins = await store.getPinsByChatId('chat-rt');
      expect(pins).toHaveLength(1);
      expect(pins[0].uid).toBe('rt-pin-1');
      expect(pins[0].chatId).toBe('chat-rt');
      expect(pins[0].provider).toBe('chatgpt');
      expect(pins[0].role).toBe('assistant');
      expect(pins[0].text).toBe('Hello world');
    });
  });

  // ── deletePin ──────────────────────────────────────────────────

  describe('deletePin', () => {
    it('removes a pin so it is no longer returned by getPinsByChatId', async () => {
      const pin = makePinRecord({ uid: 'del-pin-1', chatId: 'chat-del' });
      await store.putPin(pin);

      // Verify it exists
      let pins = await store.getPinsByChatId('chat-del');
      expect(pins).toHaveLength(1);

      // Delete it
      await store.deletePin('del-pin-1');

      // Verify it's gone
      pins = await store.getPinsByChatId('chat-del');
      expect(pins).toHaveLength(0);
    });
  });

  // ── getPinsByChatId filtering ──────────────────────────────────

  describe('getPinsByChatId filtering', () => {
    it('returns only pins for the specified chatId', async () => {
      const pinA = makePinRecord({ uid: 'filter-pin-a', chatId: 'chat-alpha' });
      const pinB = makePinRecord({ uid: 'filter-pin-b', chatId: 'chat-beta' });
      const pinC = makePinRecord({ uid: 'filter-pin-c', chatId: 'chat-alpha' });

      await store.putPin(pinA);
      await store.putPin(pinB);
      await store.putPin(pinC);

      const alphaPins = await store.getPinsByChatId('chat-alpha');
      expect(alphaPins).toHaveLength(2);
      const alphaUids = alphaPins.map((p) => p.uid).sort();
      expect(alphaUids).toEqual(['filter-pin-a', 'filter-pin-c']);

      const betaPins = await store.getPinsByChatId('chat-beta');
      expect(betaPins).toHaveLength(1);
      expect(betaPins[0].uid).toBe('filter-pin-b');

      const emptyPins = await store.getPinsByChatId('chat-nonexistent');
      expect(emptyPins).toHaveLength(0);
    });
  });

  // ── putMessages + getMessagesByChatId round-trip ───────────────

  describe('putMessages + getMessagesByChatId round-trip', () => {
    it('stores messages and retrieves them by chatId', async () => {
      const messages: StoredMessage[] = [
        makeStoredMessage({ uid: 'msg-rt-1', chatId: 'chat-msgs', ordinal: 1, role: 'user' }),
        makeStoredMessage({ uid: 'msg-rt-2', chatId: 'chat-msgs', ordinal: 2, role: 'assistant' }),
      ];

      await store.putMessages(messages);

      const retrieved = await store.getMessagesByChatId('chat-msgs');
      expect(retrieved).toHaveLength(2);

      const uids = retrieved.map((m) => m.uid).sort();
      expect(uids).toEqual(['msg-rt-1', 'msg-rt-2']);

      const userMsg = retrieved.find((m) => m.uid === 'msg-rt-1')!;
      expect(userMsg.role).toBe('user');
      expect(userMsg.ordinal).toBe(1);
      expect(userMsg.chatId).toBe('chat-msgs');
    });
  });

  // ── getMessagesByChatId filtering ──────────────────────────────

  describe('getMessagesByChatId filtering', () => {
    it('returns only messages for the specified chatId', async () => {
      const messages: StoredMessage[] = [
        makeStoredMessage({ uid: 'filt-msg-1', chatId: 'chat-x' }),
        makeStoredMessage({ uid: 'filt-msg-2', chatId: 'chat-y' }),
        makeStoredMessage({ uid: 'filt-msg-3', chatId: 'chat-x' }),
      ];

      await store.putMessages(messages);

      const xMessages = await store.getMessagesByChatId('chat-x');
      expect(xMessages).toHaveLength(2);
      const xUids = xMessages.map((m) => m.uid).sort();
      expect(xUids).toEqual(['filt-msg-1', 'filt-msg-3']);

      const yMessages = await store.getMessagesByChatId('chat-y');
      expect(yMessages).toHaveLength(1);
      expect(yMessages[0].uid).toBe('filt-msg-2');

      const emptyMessages = await store.getMessagesByChatId('chat-nonexistent');
      expect(emptyMessages).toHaveLength(0);
    });
  });

  // ── Degraded mode (db not opened) ─────────────────────────────

  describe('degraded mode — db is null', () => {
    let degradedStore: IndexedDBStore;

    beforeEach(() => {
      // Create a store but do NOT call open(), so db remains null
      degradedStore = new IndexedDBStore();
    });

    it('putPin is a no-op and does not throw', async () => {
      const pin = makePinRecord({ uid: 'degraded-pin' });
      await expect(degradedStore.putPin(pin)).resolves.toBeUndefined();
    });

    it('deletePin is a no-op and does not throw', async () => {
      await expect(degradedStore.deletePin('any-uid')).resolves.toBeUndefined();
    });

    it('getPinsByChatId returns an empty array', async () => {
      const pins = await degradedStore.getPinsByChatId('any-chat');
      expect(pins).toEqual([]);
    });

    it('putMessages is a no-op and does not throw', async () => {
      const messages = [makeStoredMessage({ uid: 'degraded-msg' })];
      await expect(degradedStore.putMessages(messages)).resolves.toBeUndefined();
    });

    it('getMessagesByChatId returns an empty array', async () => {
      const messages = await degradedStore.getMessagesByChatId('any-chat');
      expect(messages).toEqual([]);
    });
  });
});
