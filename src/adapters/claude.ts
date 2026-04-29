/**
 * Claude SiteAdapter for MessageRail.
 *
 * Extracts messages from the Claude.ai DOM using structural CSS selectors.
 * Claude renders conversations with `[data-testid]` attributes on message
 * containers and uses distinct wrappers for human vs assistant turns.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector for individual message turn containers.
 * Claude wraps each turn in a div with `data-testid` containing "human" or "assistant".
 */
const MESSAGE_TURN_SELECTOR = '[data-testid^="human-turn"], [data-testid^="assistant-turn"]';

/**
 * Selector for the main conversation thread container.
 */
const CHAT_CONTAINER_SELECTOR = '[class*="conversation-content"], main';

/**
 * Selector for detecting streaming state.
 * Claude shows a stop button while streaming.
 */
const STREAMING_INDICATOR_SELECTOR = 'button[aria-label="Stop Response"], [data-testid="stop-button"]';

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 150;

/**
 * Extracts the chat ID from a Claude URL.
 * Claude conversation URLs follow the pattern `/chat/<chatId>`.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === 'chat' && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  return null;
}

/**
 * Determines the role from a message turn element's data-testid attribute.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const testId = element.getAttribute('data-testid') ?? '';
  return testId.startsWith('human') ? 'user' : 'assistant';
}

/**
 * Extracts the text content from a message turn element.
 * Targets the prose content area within the message.
 */
function extractText(element: Element): string {
  // Claude renders message content in a nested div with paragraph elements
  const contentArea = element.querySelector('[class*="message-content"], .prose, [class*="markdown"]');
  const rawText = (contentArea ?? element).textContent ?? '';
  return rawText;
}

/**
 * Claude SiteAdapter implementation.
 */
export class ClaudeAdapter implements SiteAdapter {
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'claude.ai' || url.hostname === 'www.claude.ai';
  }

  getChatContext(doc: Document): ChatContext | null {
    const url = new URL(doc.URL);
    const chatId = extractChatId(url);
    if (!chatId) {
      return null;
    }

    const titleElement = doc.querySelector('title');
    const rawTitle = titleElement?.textContent ?? null;
    const title = rawTitle && rawTitle !== 'Claude' ? rawTitle : null;

    return {
      provider: 'claude',
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

    // Detect if the last assistant message is still streaming
    const isCurrentlyStreaming = doc.querySelector(STREAMING_INDICATOR_SELECTOR) !== null;

    let ordinal = 0;
    elements.forEach((element) => {
      ordinal++;
      const role = resolveRole(element);
      const text = extractText(element);

      // Only the last assistant message can be streaming
      const isLastAssistant =
        role === 'assistant' &&
        element === elements[elements.length - 1] &&
        isCurrentlyStreaming;

      const status: 'streaming' | 'complete' = isLastAssistant ? 'streaming' : 'complete';
      const nativeId = element.getAttribute('data-testid') ?? null;

      const uid = status === 'streaming'
        ? generateStreamingUID('claude', chatId, role, ordinal)
        : generateUID('claude', chatId, role, ordinal, normalizeText(text));

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
      console.warn('[MessageRail] Claude chat container not found for observer attachment.');
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
