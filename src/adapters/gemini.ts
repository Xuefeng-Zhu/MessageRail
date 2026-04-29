/**
 * Gemini SiteAdapter for MessageRail.
 *
 * Extracts messages from the Gemini (gemini.google.com) DOM.
 * Gemini uses web components and `message-content` elements within
 * turn containers identified by `model-response` and `user-query` tags.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector for message turn containers.
 * Gemini uses custom elements for turns.
 */
const MESSAGE_TURN_SELECTOR = 'user-query, model-response';

/**
 * Selector for the main conversation container.
 */
const CHAT_CONTAINER_SELECTOR = '.conversation-container, main';

/**
 * Selector for detecting streaming state.
 * Gemini shows a loading/thinking indicator while generating.
 */
const STREAMING_INDICATOR_SELECTOR = '.loading-indicator, .thinking-indicator, model-response[is-streaming]';

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the chat ID from a Gemini URL.
 * Gemini URLs follow patterns like `/app/<chatId>` or `/chat/<chatId>`.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  // Look for a UUID-like segment or the segment after 'app' or 'chat'
  for (let i = 0; i < segments.length; i++) {
    if ((segments[i] === 'app' || segments[i] === 'chat') && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  // Fallback: use the last segment if it looks like an ID
  const last = segments[segments.length - 1];
  if (last && last.length > 8) {
    return last;
  }
  return null;
}

/**
 * Determines the role from a message turn element's tag name.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const tag = element.tagName.toLowerCase();
  return tag === 'user-query' ? 'user' : 'assistant';
}

/**
 * Extracts the text content from a message turn element.
 */
function extractText(element: Element): string {
  // Gemini renders content in message-content elements or markdown containers
  const contentArea = element.querySelector('message-content, .markdown, .response-content, .query-content');
  const rawText = (contentArea ?? element).textContent ?? '';
  return rawText;
}

/**
 * Gemini SiteAdapter implementation.
 */
export class GeminiAdapter implements SiteAdapter {
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'gemini.google.com';
  }

  getChatContext(doc: Document): ChatContext | null {
    const url = new URL(doc.URL);
    const chatId = extractChatId(url);
    if (!chatId) {
      return null;
    }

    const titleElement = doc.querySelector('title');
    const rawTitle = titleElement?.textContent ?? null;
    const title = rawTitle && rawTitle !== 'Gemini' ? rawTitle : null;

    return {
      provider: 'gemini',
      chatId,
      url: doc.URL,
      title,
    };
  }

  scanVisible(doc: Document): ObservedMessage[] {
    const elements = doc.querySelectorAll(MESSAGE_TURN_SELECTOR);
    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = doc.querySelector(STREAMING_INDICATOR_SELECTOR) !== null;

    let ordinal = 0;
    elements.forEach((element) => {
      ordinal++;
      const role = resolveRole(element);
      const text = extractText(element);

      const isLastAssistant =
        role === 'assistant' &&
        element === elements[elements.length - 1] &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = element.getAttribute('data-message-id') ?? null;

      const uid = status === 'streaming'
        ? generateStreamingUID('gemini', chatId, role, ordinal)
        : generateUID('gemini', chatId, role, ordinal, normalizeText(text));

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
      console.warn('[MessageRail] Gemini chat container not found for observer attachment.');
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
