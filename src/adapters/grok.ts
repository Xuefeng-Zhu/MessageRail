/**
 * Grok SiteAdapter for MessageRail.
 *
 * Extracts messages from the Grok (grok.com) DOM.
 *
 * Known DOM structure (as of 2025):
 * - Message bubbles: .message-bubble, aligned with items-end/items-start
 * - User messages: [data-testid="user-message"] or right-aligned .message-bubble
 * - Assistant responses: .response-content-markdown.markdown inside a .message-bubble
 *   wrapped in a parent with id="response-<uuid>"
 * - Text content: elements with class .break-words, white-space: pre-wrap
 * - Readability marker: [data-nn-readability-processed="true"]
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector strategies for message elements, ordered from current Grok
 * structure to broader fallbacks.
 */
const MESSAGE_SELECTOR_STRATEGIES = [
  '.message-bubble',
  '[data-testid="user-message"], .response-content-markdown',
  '[data-testid*="message"], [data-message-author-role], [data-role], div[id^="response-"]',
];

/**
 * Selector strategies for the conversation container.
 */
const CONTAINER_SELECTOR_STRATEGIES = [
  '[role="main"]',
  'main',
  '[class*="conversation"]',
  '[class*="chat"]',
  '[class*="overflow-y-auto"]',
  '[class*="scroll"]',
  'body',
];

/**
 * Selectors for detecting streaming state.
 */
const STREAMING_SELECTORS = [
  'button[aria-label*="Stop"]',
  '[class*="streaming"]',
  '[class*="generating"]',
];

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the chat ID from a Grok URL.
 * Grok URLs follow the pattern `/c/<chatId>` with optional `?rid=<responseId>`.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if (
      (segments[i] === 'c' || segments[i] === 'chat' || segments[i] === 'conversation') &&
      i + 1 < segments.length
    ) {
      return segments[i + 1];
    }
  }
  // Fallback: use last segment if it looks like an ID
  const last = segments[segments.length - 1];
  if (last && last.length > 8) {
    return last;
  }
  // If no path-based ID, use a session-based ID
  return null;
}

/**
 * Finds the conversation container element.
 */
function findContainer(doc: Document): Element | null {
  for (const selector of CONTAINER_SELECTOR_STRATEGIES) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Detects if streaming is currently active.
 */
function isStreamingActive(doc: Document): boolean {
  for (const selector of STREAMING_SELECTORS) {
    if (doc.querySelector(selector)) return true;
  }
  return false;
}

/**
 * Attempts to find Grok message elements using multiple selector strategies.
 */
function findMessageElements(doc: Document): Element[] {
  for (const strategy of MESSAGE_SELECTOR_STRATEGIES) {
    const elements = Array.from(doc.querySelectorAll(strategy)).filter((element) =>
      Boolean(element.textContent?.trim())
    );
    if (elements.length > 0) {
      return elements;
    }
  }
  return [];
}

/**
 * Returns true if any class token contains the requested substring.
 */
function hasClassPart(element: Element, part: string): boolean {
  return Array.from(element.classList).some((className) => className.includes(part));
}

/**
 * Determines the role from a message element.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const testId = element.getAttribute('data-testid') ?? '';
  if (testId.includes('user')) return 'user';
  if (testId.includes('assistant')) return 'assistant';

  const authorRole = element.getAttribute('data-message-author-role');
  if (authorRole === 'user') return 'user';
  if (authorRole === 'assistant') return 'assistant';

  const dataRole = element.getAttribute('data-role');
  if (dataRole === 'user') return 'user';
  if (dataRole === 'assistant') return 'assistant';

  if (hasClassPart(element, 'items-end')) return 'user';
  if (hasClassPart(element, 'items-start')) return 'assistant';

  if (element.matches('.response-content-markdown') || element.querySelector('.response-content-markdown')) {
    return 'assistant';
  }

  return 'assistant';
}

/**
 * Extracts the text content from a message element.
 */
function extractText(element: Element, role: 'user' | 'assistant'): string {
  if (role === 'assistant') {
    const markdown = element.matches('.response-content-markdown')
      ? element
      : element.querySelector('.response-content-markdown');
    if (markdown) {
      return markdown.textContent ?? '';
    }
  }

  if (element.matches('.response-content-markdown')) {
    return element.textContent ?? '';
  }

  const content = element.querySelector('.break-words, .whitespace-pre-wrap, p');
  if (content) {
    return content.textContent ?? '';
  }

  return element.textContent ?? '';
}

/**
 * Extracts a provider-native ID from the message or its response wrapper.
 */
function extractNativeId(element: Element): string | null {
  if (element.id) return element.id;
  const responseWrapper = element.closest('[id^="response-"]');
  if (responseWrapper?.id) return responseWrapper.id;
  return (
    element.getAttribute('data-message-id') ??
    element.getAttribute('data-testid') ??
    element.getAttribute('data-role') ??
    null
  );
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

    // If no chat ID found, return null — pollForAdapter will retry
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
    const elements = findMessageElements(doc);
    if (elements.length === 0) {
      return [];
    }

    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = isStreamingActive(doc);

    let ordinal = 0;
    elements.forEach((element) => {
      const role = resolveRole(element);
      const text = extractText(element, role);

      // Skip empty elements
      if (!text.trim()) return;

      ordinal++;

      const isLastAssistant =
        role === 'assistant' &&
        element === elements[elements.length - 1] &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = extractNativeId(element);

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
    const container = findContainer(doc);
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
    return findContainer(doc) !== null;
  }
}
