/**
 * Perplexity SiteAdapter for MessageRail.
 *
 * Extracts messages from the Perplexity (perplexity.ai) DOM.
 * Perplexity renders a thread of query/answer pairs, where each
 * query block is a user message and each answer block is an assistant response.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector for message containers.
 * Perplexity uses query/answer block patterns in its thread view.
 */
const MESSAGE_SELECTOR = '[class*="query"], [class*="answer"], [data-testid*="message"]';

/**
 * Selector for the main thread container.
 */
const CHAT_CONTAINER_SELECTOR = '[class*="thread"], [class*="conversation"], main';

/**
 * Selector for detecting streaming state.
 */
const STREAMING_INDICATOR_SELECTOR = '[class*="streaming"], [class*="generating"], [class*="loading"]';

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the thread/chat ID from a Perplexity URL.
 * Perplexity URLs follow patterns like `/search/<threadId>` or `/thread/<threadId>`.
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
 * Determines the role from a message element.
 * Checks class names and data attributes for query/answer patterns.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const className = element.className ?? '';
  const testId = element.getAttribute('data-testid') ?? '';

  if (
    className.includes('query') ||
    className.includes('user') ||
    testId.includes('query') ||
    testId.includes('user')
  ) {
    return 'user';
  }
  return 'assistant';
}

/**
 * Extracts the text content from a message element.
 */
function extractText(element: Element): string {
  // Perplexity renders answers with markdown and citations
  const contentArea = element.querySelector(
    '[class*="content"], [class*="markdown"], .prose, [class*="answer-text"]'
  );
  const rawText = (contentArea ?? element).textContent ?? '';
  return rawText;
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
    const elements = doc.querySelectorAll(MESSAGE_SELECTOR);
    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = doc.querySelector(STREAMING_INDICATOR_SELECTOR) !== null;

    let ordinal = 0;
    elements.forEach((element) => {
      // Skip nested matches
      if (element.closest(MESSAGE_SELECTOR) !== element) {
        return;
      }

      ordinal++;
      const role = resolveRole(element);
      const text = extractText(element);

      // Skip empty elements
      if (!text.trim()) return;

      const isLastAssistant =
        role === 'assistant' &&
        element === elements[elements.length - 1] &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = element.getAttribute('data-testid') ?? element.id ?? null;

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
    });

    return messages;
  }

  observe(doc: Document, onUpdate: (messages: ObservedMessage[]) => void): () => void {
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
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
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
    return container !== null;
  }
}
