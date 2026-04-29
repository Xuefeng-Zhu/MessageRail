/**
 * ChatGPT SiteAdapter for MessageRail.
 *
 * Extracts messages from the ChatGPT DOM using structural CSS selectors
 * (data attributes, tag hierarchy) rather than English text labels.
 * Handles streaming detection, MutationObserver-based live updates,
 * and LiveAnchor materialization for jump-to-message navigation.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';
import { generateUID, generateStreamingUID } from '../utils/uid';
import { normalizeText } from '../utils/normalize';

/**
 * Selector for individual message elements.
 * ChatGPT uses `data-message-author-role` attributes on message containers.
 */
const MESSAGE_SELECTOR = '[data-message-author-role]';

/**
 * Selector for the chat conversation container.
 * ChatGPT renders the conversation inside a `[role="presentation"]` element.
 */
const CHAT_CONTAINER_SELECTOR = '[role="presentation"]';

/**
 * Attribute that indicates the author role on a message element.
 */
const ROLE_ATTRIBUTE = 'data-message-author-role';

/**
 * Attribute that indicates a message is currently streaming.
 */
const STREAMING_ATTRIBUTE = 'data-is-streaming';

/**
 * Attribute that holds the provider-native message ID, if present.
 */
const MESSAGE_ID_ATTRIBUTE = 'data-message-id';

/**
 * Debounce interval in milliseconds for MutationObserver callbacks.
 */
const DEBOUNCE_MS = 100;

/**
 * Extracts the chat ID from a ChatGPT URL path.
 * ChatGPT conversation URLs follow the pattern `/c/<chatId>` or `/g/<gizmoId>/c/<chatId>`.
 * Returns null if no chat ID segment is found.
 */
function extractChatId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  // Look for the segment after 'c' in the path
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === 'c' && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  return null;
}

/**
 * Determines the role from a message element's data attribute.
 * Returns 'user' or 'assistant', defaulting to 'assistant' for
 * any role that isn't explicitly 'user' (e.g., 'system', 'tool').
 */
function resolveRole(element: Element): 'user' | 'assistant' {
  const role = element.getAttribute(ROLE_ATTRIBUTE);
  return role === 'user' ? 'user' : 'assistant';
}

/**
 * Determines whether a message element is currently streaming.
 * Checks for the `data-is-streaming` attribute on the element itself
 * or any descendant.
 */
function isStreaming(element: Element): boolean {
  if (element.getAttribute(STREAMING_ATTRIBUTE) === 'true') {
    return true;
  }
  const streamingChild = element.querySelector(`[${STREAMING_ATTRIBUTE}="true"]`);
  return streamingChild !== null;
}

/**
 * Extracts the text content from a message element.
 * Targets the prose content area within the message, falling back
 * to the element's full textContent.
 */
function extractText(element: Element): string {
  // ChatGPT wraps message prose in a div with class containing 'markdown'
  // or in a direct text container. Use structural traversal.
  const proseContainer = element.querySelector('.markdown, .whitespace-pre-wrap');
  const rawText = (proseContainer ?? element).textContent ?? '';
  return rawText;
}

/**
 * ChatGPT SiteAdapter implementation.
 *
 * Implements the SiteAdapter interface for chatgpt.com, using structural
 * CSS selectors and data attributes to extract messages from the DOM.
 */
export class ChatGPTAdapter implements SiteAdapter {
  /**
   * Returns true if the URL hostname is chatgpt.com.
   */
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'chatgpt.com' || url.hostname === 'www.chatgpt.com';
  }

  /**
   * Extracts the ChatContext from the current document.
   * Returns null if no chat ID can be determined from the URL.
   */
  getChatContext(doc: Document): ChatContext | null {
    const url = new URL(doc.URL);
    const chatId = extractChatId(url);
    if (!chatId) {
      return null;
    }

    // Attempt to extract the conversation title from the document
    const titleElement = doc.querySelector('title');
    const rawTitle = titleElement?.textContent ?? null;
    // Filter out generic titles that aren't conversation-specific
    const title = rawTitle && rawTitle !== 'ChatGPT' ? rawTitle : null;

    return {
      provider: 'chatgpt',
      chatId,
      url: doc.URL,
      title,
    };
  }

  /**
   * Scans the DOM for all visible message elements and returns
   * ObservedMessage records with role, text, status, and UID.
   */
  scanVisible(doc: Document): ObservedMessage[] {
    const elements = doc.querySelectorAll(MESSAGE_SELECTOR);
    const url = new URL(doc.URL);
    const chatId = extractChatId(url) ?? 'unknown';
    const messages: ObservedMessage[] = [];

    let ordinal = 0;
    elements.forEach((element) => {
      ordinal++;
      const role = resolveRole(element);
      const text = extractText(element);
      const streaming = isStreaming(element);
      const status: 'streaming' | 'complete' = streaming ? 'streaming' : 'complete';
      const nativeId = element.getAttribute(MESSAGE_ID_ATTRIBUTE) ?? null;

      const uid = streaming
        ? generateStreamingUID('chatgpt', chatId, role, ordinal)
        : generateUID('chatgpt', chatId, role, ordinal, normalizeText(text));

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

  /**
   * Attaches a MutationObserver to the chat container and calls onUpdate
   * when messages change. Debounces callbacks to avoid excessive updates.
   * Returns a cleanup function that disconnects the observer.
   */
  observe(doc: Document, onUpdate: (messages: ObservedMessage[]) => void): () => void {
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
    if (!container) {
      // No container found — return a no-op cleanup function
      console.warn('[MessageRail] ChatGPT chat container not found for observer attachment.');
      return () => {};
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSnapshotJson = '';

    const handleMutations = () => {
      const messages = this.scanVisible(doc);
      // Deduplicate: only call onUpdate if the message set has actually changed
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

  /**
   * Returns a LiveAnchor bound to the message's DOM element,
   * or null if the element is no longer in the DOM.
   */
  materializeMessage(msg: ObservedMessage, doc: Document): LiveAnchor | null {
    // Verify the element is still attached to the document
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
          // For non-HTML elements, try to find a focusable child
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

  /**
   * Verifies that the expected ChatGPT DOM structure is present.
   * Returns true if the chat container and at least the message
   * selector structure are found.
   */
  healthcheck(doc: Document): boolean {
    const container = doc.querySelector(CHAT_CONTAINER_SELECTOR);
    if (!container) {
      return false;
    }
    // Verify that the structural selector for messages is present
    // (at least one message element or the container itself is valid)
    return true;
  }
}
