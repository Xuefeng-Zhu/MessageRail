/**
 * Claude SiteAdapter for MessageRail.
 *
 * Extracts messages from the Claude.ai DOM. Claude renders conversations
 * using message bubbles with data-testid attributes and font-* classes.
 *
 * Known DOM structure (as of 2025):
 * - User messages: [data-testid="user-message"] with class .font-user-message
 * - Assistant messages: [data-testid="assistant-message"] or elements with
 *   class .font-claude-message
 * - Parent bubble: [data-user-message-bubble="true"]
 * - Text content: <p class="whitespace-pre-wrap break-words">
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector strategies for message elements, ordered by specificity.
 * The first strategy that returns results wins.
 */
const MESSAGE_SELECTOR_STRATEGIES = [
  // Primary: data-testid for user + font class for assistant (confirmed April 2025)
  '[data-testid="user-message"], .font-claude-response',
  // Fallback 1: both as data-testid
  '[data-testid="user-message"], [data-testid="assistant-message"]',
  // Fallback 2: font-based class names
  '.font-user-message, .font-claude-message',
];

/**
 * Selector strategies for the conversation container.
 * Claude uses deeply nested divs; we look for the scrollable thread area.
 */
const CONTAINER_SELECTOR_STRATEGIES = [
  '[role="main"]',
  'main',
  // Claude's conversation area is often a scrollable div
  '[class*="overflow-y-auto"]',
  '[class*="scroll"]',
  // Fallback: body
  'body',
];

/**
 * Selectors for detecting streaming state.
 */
const STREAMING_SELECTORS = [
  '[data-is-streaming="true"]',
  'button[aria-label*="Stop"]',
  '[data-testid="stop-button"]',
];

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
 * Attempts to find message elements using multiple selector strategies.
 */
function findMessageElements(doc: Document): NodeListOf<Element> | null {
  for (const strategy of MESSAGE_SELECTOR_STRATEGIES) {
    const elements = doc.querySelectorAll(strategy);
    if (elements.length > 0) {
      return elements;
    }
  }
  return null;
}

/**
 * Determines the role from a message element.
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  // Check data-testid
  const testId = element.getAttribute('data-testid') ?? '';
  if (testId === 'user-message' || testId.includes('user')) return 'user';
  if (testId === 'assistant-message' || testId.includes('assistant')) return 'assistant';

  // Check class names
  const className = element.className ?? '';
  if (className.includes('font-user-message') || className.includes('user-message')) return 'user';
  if (className.includes('font-claude-response') || className.includes('font-claude-message') || className.includes('claude')) return 'assistant';

  // Check bubble attributes
  if (element.hasAttribute('data-user-message-bubble')) return 'user';

  return 'assistant';
}

/**
 * Extracts the text content from a message element.
 * Claude renders text in <p> tags with whitespace-pre-wrap class.
 */
function extractText(element: Element): string {
  // Try the whitespace-pre-wrap paragraphs first (confirmed in DOM)
  const paragraphs = element.querySelectorAll('p.whitespace-pre-wrap');
  if (paragraphs.length > 0) {
    return Array.from(paragraphs).map(p => p.textContent ?? '').join('\n');
  }

  // Try generic paragraph content
  const allParagraphs = element.querySelectorAll('p');
  if (allParagraphs.length > 0) {
    return Array.from(allParagraphs).map(p => p.textContent ?? '').join('\n');
  }

  // Fallback to full text content
  return element.textContent ?? '';
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
    const elements = findMessageElements(doc);
    if (!elements) {
      return [];
    }

    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    const isCurrentlyStreaming = isStreamingActive(doc);

    let ordinal = 0;
    elements.forEach((element) => {
      const role = resolveRole(element);
      const text = extractText(element);

      // Skip empty elements
      if (!text.trim()) return;

      ordinal++;

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
    const container = findContainer(doc);
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
    return findContainer(doc) !== null;
  }
}
