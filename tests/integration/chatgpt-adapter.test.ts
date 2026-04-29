import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatGPTAdapter } from '../../src/adapters/chatgpt';
import type { ObservedMessage } from '../../src/types';

/**
 * Fixture-based integration tests for the ChatGPT adapter.
 *
 * Loads the static HTML fixture at tests/fixtures/chatgpt-basic.html
 * into jsdom and exercises the full SiteAdapter interface:
 * canHandle, getChatContext, scanVisible, observe, materializeMessage,
 * and healthcheck.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 16.5
 */

const FIXTURE_PATH = resolve(__dirname, '../fixtures/chatgpt-basic.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf-8');

/**
 * Loads the fixture HTML into the current jsdom document and sets
 * the document URL to a ChatGPT conversation URL.
 */
function loadFixture(): Document {
  document.documentElement.innerHTML = '';
  // Parse the fixture body content and inject it
  const parser = new DOMParser();
  const fixtureDoc = parser.parseFromString(FIXTURE_HTML, 'text/html');
  document.documentElement.innerHTML = fixtureDoc.documentElement.innerHTML;

  // jsdom uses document.URL which defaults to 'about:blank'.
  // We override it via Object.defineProperty so the adapter can extract the chat ID.
  Object.defineProperty(document, 'URL', {
    value: 'https://chatgpt.com/c/test-chat-123',
    writable: true,
    configurable: true,
  });

  return document;
}

describe('ChatGPT Adapter — Fixture-based integration tests', () => {
  let adapter: ChatGPTAdapter;
  let doc: Document;

  beforeEach(() => {
    adapter = new ChatGPTAdapter();
    doc = loadFixture();
  });

  afterEach(() => {
    // Restore document URL
    Object.defineProperty(document, 'URL', {
      value: 'about:blank',
      writable: true,
      configurable: true,
    });
  });

  // ── canHandle ──────────────────────────────────────────────────

  describe('canHandle', () => {
    it('returns true for chatgpt.com URLs', () => {
      const url = new URL('https://chatgpt.com/c/test-chat-123');
      expect(adapter.canHandle(url, doc)).toBe(true);
    });

    it('returns true for www.chatgpt.com URLs', () => {
      const url = new URL('https://www.chatgpt.com/c/abc');
      expect(adapter.canHandle(url, doc)).toBe(true);
    });

    it('returns false for non-ChatGPT URLs', () => {
      expect(adapter.canHandle(new URL('https://claude.ai/chat/1'), doc)).toBe(false);
      expect(adapter.canHandle(new URL('https://google.com'), doc)).toBe(false);
      expect(adapter.canHandle(new URL('https://example.com'), doc)).toBe(false);
    });
  });

  // ── getChatContext ─────────────────────────────────────────────

  describe('getChatContext', () => {
    it('extracts the correct chat ID and provider', () => {
      const ctx = adapter.getChatContext(doc);
      expect(ctx).not.toBeNull();
      expect(ctx!.provider).toBe('chatgpt');
      expect(ctx!.chatId).toBe('test-chat-123');
      expect(ctx!.url).toBe('https://chatgpt.com/c/test-chat-123');
    });

    it('returns null when URL has no chat ID segment', () => {
      Object.defineProperty(document, 'URL', {
        value: 'https://chatgpt.com/',
        writable: true,
        configurable: true,
      });
      const ctx = adapter.getChatContext(doc);
      expect(ctx).toBeNull();
    });
  });

  // ── scanVisible ────────────────────────────────────────────────

  describe('scanVisible', () => {
    it('extracts all 3 messages from the fixture', () => {
      const messages = adapter.scanVisible(doc);
      expect(messages).toHaveLength(3);
    });

    it('assigns correct roles to each message', () => {
      const messages = adapter.scanVisible(doc);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('assistant');
    });

    it('extracts text content from each message', () => {
      const messages = adapter.scanVisible(doc);
      expect(messages[0].text).toContain('What is the capital of France?');
      expect(messages[1].text).toContain('The capital of France is Paris');
      expect(messages[2].text).toContain('Paris has a population of approximately');
    });

    it('detects streaming status on the third message', () => {
      const messages = adapter.scanVisible(doc);
      expect(messages[0].status).toBe('complete');
      expect(messages[1].status).toBe('complete');
      expect(messages[2].status).toBe('streaming');
    });

    it('extracts native message IDs from data attributes', () => {
      const messages = adapter.scanVisible(doc);
      expect(messages[0].nativeId).toBe('msg-user-001');
      expect(messages[1].nativeId).toBe('msg-asst-001');
      expect(messages[2].nativeId).toBe('msg-asst-002');
    });

    it('generates a UID for each message', () => {
      const messages = adapter.scanVisible(doc);
      for (const msg of messages) {
        expect(msg.uid).toBeTruthy();
        expect(typeof msg.uid).toBe('string');
      }
    });

    it('uses structural selectors — roles come from data attributes, not English text', () => {
      // Verify the fixture uses data-message-author-role, not text labels
      const elements = doc.querySelectorAll('[data-message-author-role]');
      expect(elements.length).toBe(3);
      // Each element has the attribute, confirming structural selection
      expect(elements[0].getAttribute('data-message-author-role')).toBe('user');
      expect(elements[1].getAttribute('data-message-author-role')).toBe('assistant');
      expect(elements[2].getAttribute('data-message-author-role')).toBe('assistant');
    });

    it('attaches the source DOM element to each ObservedMessage', () => {
      const messages = adapter.scanVisible(doc);
      for (const msg of messages) {
        expect(msg.element).toBeInstanceOf(Element);
        expect(doc.contains(msg.element)).toBe(true);
      }
    });
  });

  // ── observe (MutationObserver) ─────────────────────────────────

  describe('observe', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('fires callback when a new message element is added to the DOM', async () => {
      const callback = vi.fn();
      const cleanup = adapter.observe(doc, callback);

      // Add a new message element to the chat container
      const container = doc.querySelector('[role="presentation"]')!;
      const newMsg = doc.createElement('div');
      newMsg.setAttribute('data-message-author-role', 'user');
      newMsg.setAttribute('data-message-id', 'msg-user-002');
      const textDiv = doc.createElement('div');
      textDiv.className = 'whitespace-pre-wrap';
      textDiv.textContent = 'Tell me more about Paris.';
      newMsg.appendChild(textDiv);
      container.appendChild(newMsg);

      // Advance past the 100ms debounce
      await vi.advanceTimersByTimeAsync(150);

      expect(callback).toHaveBeenCalled();
      const messages: ObservedMessage[] = callback.mock.calls[0][0];
      expect(messages.length).toBe(4);

      cleanup();
    });

    it('cleanup function disconnects the observer — no further callbacks', async () => {
      const callback = vi.fn();
      const cleanup = adapter.observe(doc, callback);

      // Disconnect
      cleanup();

      // Mutate the DOM after cleanup
      const container = doc.querySelector('[role="presentation"]')!;
      const newMsg = doc.createElement('div');
      newMsg.setAttribute('data-message-author-role', 'user');
      container.appendChild(newMsg);

      await vi.advanceTimersByTimeAsync(150);

      expect(callback).not.toHaveBeenCalled();
    });

    it('deduplicates — identical mutations do not trigger multiple callbacks', async () => {
      const callback = vi.fn();
      const cleanup = adapter.observe(doc, callback);

      const container = doc.querySelector('[role="presentation"]')!;

      // Add a new message
      const newMsg = doc.createElement('div');
      newMsg.setAttribute('data-message-author-role', 'user');
      newMsg.setAttribute('data-message-id', 'msg-user-003');
      const textDiv = doc.createElement('div');
      textDiv.className = 'whitespace-pre-wrap';
      textDiv.textContent = 'Another question';
      newMsg.appendChild(textDiv);
      container.appendChild(newMsg);

      // Advance past debounce — first callback fires
      await vi.advanceTimersByTimeAsync(150);
      expect(callback).toHaveBeenCalledTimes(1);

      // Trigger another mutation that doesn't change the message set
      // (e.g., add a non-message element)
      const decorativeDiv = doc.createElement('div');
      decorativeDiv.className = 'some-decoration';
      container.appendChild(decorativeDiv);

      await vi.advanceTimersByTimeAsync(150);

      // The callback should not fire again because the message snapshot is identical
      expect(callback).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('debounces rapid mutations into a single callback', async () => {
      const callback = vi.fn();
      const cleanup = adapter.observe(doc, callback);

      const container = doc.querySelector('[role="presentation"]')!;

      // Rapidly add multiple elements within the debounce window
      for (let i = 0; i < 5; i++) {
        const el = doc.createElement('span');
        container.appendChild(el);
        await vi.advanceTimersByTimeAsync(10); // 10ms apart, well within 100ms debounce
      }

      // Advance past the debounce window
      await vi.advanceTimersByTimeAsync(150);

      // Should have fired at most once (debounced)
      expect(callback.mock.calls.length).toBeLessThanOrEqual(1);

      cleanup();
    });

    it('returns a no-op cleanup when chat container is missing', () => {
      // Remove the container
      const container = doc.querySelector('[role="presentation"]');
      container?.remove();

      const callback = vi.fn();
      const cleanup = adapter.observe(doc, callback);

      // Should return a function that doesn't throw
      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
    });
  });

  // ── healthcheck ────────────────────────────────────────────────

  describe('healthcheck', () => {
    it('returns true when the chat container is present', () => {
      expect(adapter.healthcheck(doc)).toBe(true);
    });

    it('returns false when the chat container is removed', () => {
      const container = doc.querySelector('[role="presentation"]');
      container?.remove();
      expect(adapter.healthcheck(doc)).toBe(false);
    });
  });

  // ── materializeMessage ─────────────────────────────────────────

  describe('materializeMessage', () => {
    it('returns a LiveAnchor for an attached message element', () => {
      const messages = adapter.scanVisible(doc);
      const anchor = adapter.materializeMessage(messages[0], doc);

      expect(anchor).not.toBeNull();
      expect(anchor!.uid).toBe(messages[0].uid);
      expect(anchor!.element).toBe(messages[0].element);
      expect(typeof anchor!.scrollIntoView).toBe('function');
      expect(typeof anchor!.focusForA11y).toBe('function');
    });

    it('returns null for a detached element', () => {
      const messages = adapter.scanVisible(doc);
      // Detach the element from the DOM
      messages[0].element.remove();

      const anchor = adapter.materializeMessage(messages[0], doc);
      expect(anchor).toBeNull();
    });
  });
});
