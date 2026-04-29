/**
 * Perplexity SiteAdapter for MessageRail.
 *
 * Extracts messages from the Perplexity (perplexity.ai) DOM.
 * Perplexity renders a thread of query/answer pairs.
 *
 * Known DOM structure (as of 2025):
 * - User queries: span.select-text inside a group/title container
 * - Assistant answers: div[id^="markdown-content-"] with class gap-y-md
 * - The thread is inside a scrollable main area
 * - URL pattern: /search/<uuid>
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

interface MessageCandidate {
  element: Element;
  role: 'user' | 'assistant';
}

/**
 * Selector strategies for assistant answer content.
 * Perplexity uses id="markdown-content-N" for each answer block.
 */
const ASSISTANT_SELECTOR_STRATEGIES = [
  '[id^="markdown-content-"]',
  '[class*="prose"]',
];

/**
 * Selector strategies for user query elements.
 * Perplexity wraps user queries in styled containers.
 */
const USER_QUERY_SELECTOR_STRATEGIES = [
  '[class~="group/title"] span.select-text',
  '[class~="group/title"]',
  '[class*="break-words"][class*="word-break"]',
  '[class*="break-words"]',
];

/**
 * Selector strategies for the conversation container.
 */
const CONTAINER_SELECTOR_STRATEGIES = [
  '[role="main"]',
  'main',
  '[class*="overflow-y-auto"]',
  'body',
];

/**
 * Selectors for detecting streaming state.
 */
const STREAMING_SELECTORS = [
  '[class*="animate-pulse"]',
  '[class*="streaming"]',
  'button[aria-label*="Stop"]',
];

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the thread/chat ID from a Perplexity URL.
 * Perplexity URLs follow patterns like `/search/<threadId>`.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if (
      (segments[i] === 'search' || segments[i] === 'thread' || segments[i] === 'chat') &&
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
 * Returns elements found by the first selector strategy with results.
 */
function findByStrategies(doc: Document, strategies: string[]): Element[] {
  for (const selector of strategies) {
    const elements = Array.from(doc.querySelectorAll(selector)).filter((element) =>
      Boolean(element.textContent?.trim())
    );
    if (elements.length > 0) {
      return elements;
    }
  }
  return [];
}

/**
 * Sorts candidate message elements in DOM order.
 */
function compareDomOrder(a: Element, b: Element): number {
  if (a === b) return 0;
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * Returns true when an element is nested inside one of the assistant blocks.
 */
function isInsideAssistant(element: Element, assistantElements: Element[]): boolean {
  return assistantElements.some((assistant) => assistant !== element && assistant.contains(element));
}

/**
 * Scans for all message elements (user queries + assistant answers)
 * and returns them in DOM order.
 */
function findAllMessages(doc: Document): MessageCandidate[] {
  const assistantElements = findByStrategies(doc, ASSISTANT_SELECTOR_STRATEGIES);
  const userElements = findByStrategies(doc, USER_QUERY_SELECTOR_STRATEGIES).filter(
    (element) => !isInsideAssistant(element, assistantElements)
  );

  const candidates: MessageCandidate[] = [
    ...userElements.map((element) => ({ element, role: 'user' as const })),
    ...assistantElements.map((element) => ({ element, role: 'assistant' as const })),
  ];

  return candidates.sort((a, b) => compareDomOrder(a.element, b.element));
}

/**
 * Extracts the text content from a message element.
 */
function extractText(element: Element): string {
  return element.textContent ?? '';
}

/**
 * Extracts a provider-native ID from the message element when present.
 */
function extractNativeId(element: Element): string | null {
  if (element.id) return element.id;
  const nativeWrapper = element.closest('[data-message-id], [data-testid], [id^="markdown-content-"]');
  return (
    nativeWrapper?.getAttribute('data-message-id') ??
    nativeWrapper?.getAttribute('data-testid') ??
    nativeWrapper?.id ??
    null
  );
}

/**
 * Perplexity SiteAdapter implementation.
 */
export class PerplexityAdapter implements SiteAdapter {
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'www.perplexity.ai' || url.hostname === 'perplexity.ai';
  }

  getChatContext(doc: Document): ChatContext | null {
    const url = new URL(doc.URL);
    const chatId = extractChatId(url);
    if (!chatId) {
      return null;
    }

    const titleElement = doc.querySelector('title');
    const rawTitle = titleElement?.textContent ?? null;
    const title = rawTitle && rawTitle !== 'Perplexity' ? rawTitle : null;

    return {
      provider: 'perplexity',
      chatId,
      url: doc.URL,
      title,
    };
  }

  scanVisible(doc: Document): ObservedMessage[] {
    const allMessages = findAllMessages(doc);
    if (allMessages.length === 0) {
      return [];
    }

    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = isStreamingActive(doc);

    let ordinal = 0;
    for (const { element, role } of allMessages) {
      const text = extractText(element);

      // Skip empty elements
      if (!text.trim()) continue;

      ordinal++;

      const isLastAssistant =
        role === 'assistant' &&
        element === allMessages[allMessages.length - 1].element &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = extractNativeId(element);

      const uid = status === 'streaming'
        ? generateStreamingUID('perplexity', chatId, role, ordinal)
        : generateUID('perplexity', chatId, role, ordinal, normalizeText(text));

      messages.push({
        nativeId,
        uid,
        role,
        text,
        status,
        element,
      });
    }

    return messages;
  }

  observe(doc: Document, onUpdate: (messages: ObservedMessage[]) => void): () => void {
    const container = findContainer(doc);
    if (!container) {
      console.warn('[MessageRail] Perplexity chat container not found for observer attachment.');
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
