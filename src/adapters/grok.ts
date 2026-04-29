/**
 * Grok SiteAdapter for MessageRail.
 *
 * Extracts messages from the Grok (grok.com) DOM.
 * Grok renders conversations with message containers that use
 * role-based attributes or class names to distinguish turns.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector for individual message containers.
 * Grok uses message containers with role indicators.
 */
const MESSAGE_SELECTOR = '[class*="message"], [data-role]';

/**
 * Selector for the main conversation container.
 */
const CHAT_CONTAINER_SELECTOR = '[class*="conversation"], [class*="chat-container"], main';

/**
 * Selector for detecting streaming state.
 */
const STREAMING_INDICATOR_SELECTOR = '[class*="streaming"], [class*="generating"], [class*="typing-indicator"]';

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the chat ID from a Grok URL.
 * Grok URLs follow patterns like `/chat/<chatId>` or `/conversation/<chatId>`.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if ((segments[i] === 'chat' || segments[i] === 'conversation') && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  // Fallback: use last segment if it looks like an ID
  const last = segments[segments.length - 1];
  if (last && last.length > 8 && segments.length > 0) {
    return last;
  }
  return null;
}

/**
 * Determines the role from a message element.
 * Checks data-role attribute first, then falls back to class-based detection.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const dataRole = element.getAttribute('data-role');
  if (dataRole === 'user' || dataRole === 'human') return 'user';
  if (dataRole === 'assistant' || dataRole === 'model') return 'assistant';

  // Class-based fallback
  const className = element.className ?? '';
  if (className.includes('user') || className.includes('human')) return 'user';
  return 'assistant';
}

/**
 * Extracts the text content from a message element.
 */
function extractText(element: Element): string {
  const contentArea = element.querySelector('[class*="content"], [class*="markdown"], .prose');
  const rawText = (contentArea ?? element).textContent ?? '';
  return rawText;
}

/**
 * Grok SiteAdapter implementation.
 */
export class GrokAdapter implements SiteAdapter {
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'grok.com' || url.hostname === 'www.grok.com';
  }

  getChatContext(doc: Document): ChatContext | null {
    const url = new URL(doc.URL);
    const chatId = extractChatId(url);
    if (!chatId) {
      return null;
    }

    const titleElement = doc.querySelector('title');
    const rawTitle = titleElement?.textContent ?? null;
    const title = rawTitle && rawTitle !== 'Grok' ? rawTitle : null;

    return {
      provider: 'grok',
      chatId,
      url: doc.URL,
      title,
    };
  }

  scanVisible(doc: Document): ObservedMessage[] {
    const elements = doc.querySelectorAll(MESSAGE_SELECTOR);
    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = doc.querySelector(STREAMING_INDICATOR_SELECTOR) !== null;

    let ordinal = 0;
    elements.forEach((element) => {
      // Skip elements that don't look like actual message containers
      // (filter out nested matches)
      if (element.closest(MESSAGE_SELECTOR) !== element) {
        return;
      }

      ordinal++;
      const role = resolveRole(element);
      const text = extractText(element);

      // Skip empty elements that might be structural wrappers
      if (!text.trim()) return;

      const isLastAssistant =
        role === 'assistant' &&
        element === elements[elements.length - 1] &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = element.getAttribute('data-message-id') ?? element.id ?? null;

      const uid = status === 'streaming'
        ? generateStreamingUID('grok', chatId, role, ordinal)
        : generateUID('grok', chatId, role, ordinal, normalizeText(text));

      messages.push({
        nativeId,
        uid,
        role,
        text,
        status,
        element,
      });
    });

    return messages;
  }

  observe(doc: Document, onUpdate: (messages: ObservedMessage[]) => void): () => void {
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
    if (!container) {
      console.warn('[MessageRail] Grok chat container not found for observer attachment.');
      return () => {};
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSnapshotJson = '';

    const handleMutations = () => {
      const messages = this.scanVisible(doc);
      const snapshotJson = messages.map((m) => `${m.uid}:${m.status}:${m.text.length}`).join('|');
      if (snapshotJson === lastSnapshotJson) {
        return;
      }
      lastSnapshotJson = snapshotJson;
      onUpdate(messages);
    };

    const observer = new MutationObserver(() => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(handleMutations, DEBOUNCE_MS);
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      observer.disconnect();
    };
  }

  materializeMessage(msg: ObservedMessage, doc: Document): LiveAnchor | null {
    if (!doc.contains(msg.element)) {
      return null;
    }

    const element = msg.element;
    const uid = msg.uid;

    return {
      uid,
      element,
      scrollIntoView() {
        element.scrollIntoView({ behavior: 'smooth' });
      },
      focusForA11y() {
        if (element instanceof HTMLElement) {
          if (!element.getAttribute('tabindex')) {
            element.setAttribute('tabindex', '-1');
          }
          element.focus();
        } else {
          const focusable = element.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]'
          );
          if (focusable) {
            focusable.focus();
          }
        }
      },
    };
  }

  healthcheck(doc: Document): boolean {
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
    return container !== null;
  }
}
