/**
 * Core type definitions for the MessageRail extension.
 *
 * These interfaces define the data models and contracts used across
 * the adapter, indexing, storage, and UI layers.
 */

/**
 * A raw message record extracted from the DOM by a provider adapter.
 */
export interface ObservedMessage {
  /** Provider-native ID if available, otherwise null. */
  nativeId: string | null;
  /** Deterministic local UID. */
  uid: string;
  /** 'user' or 'assistant'. */
  role: 'user' | 'assistant';
  /** Raw text content extracted from the DOM. */
  text: string;
  /** 'streaming' while response is being generated, 'complete' when done. */
  status: 'streaming' | 'complete';
  /** Reference to the source DOM element (not persisted). */
  element: Element;
}

/**
 * An ObservedMessage enriched with index metadata.
 */
export interface IndexedMessage {
  uid: string;
  nativeId: string | null;
  role: 'user' | 'assistant';
  /** Normalized text (trimmed, whitespace-collapsed). */
  text: string;
  /** Short preview for sidebar display (first ~80 chars). */
  preview: string;
  /** Sequential ordinal starting from 1. */
  ordinal: number;
  status: 'streaming' | 'complete';
  /** Whether this message is pinned by the user. */
  pinned: boolean;
}

/**
 * Describes the current conversation.
 */
export interface ChatContext {
  /** Provider identifier, e.g. 'chatgpt', 'claude'. */
  provider: string;
  /** Conversation/chat ID extracted from the URL or DOM. */
  chatId: string;
  /** Canonical URL of the conversation. */
  url: string;
  /** Conversation title if available. */
  title: string | null;
}

/**
 * Persisted pin record stored in IndexedDB.
 */
export interface PinRecord {
  /** Message UID (primary key). */
  uid: string;
  /** Chat ID for querying pins by conversation. */
  chatId: string;
  /** Provider identifier. */
  provider: string;
  /** Message role. */
  role: 'user' | 'assistant';
  /** Message ordinal at time of pinning. */
  ordinal: number;
  /** Message text at time of pinning. */
  text: string;
  /** Timestamp when pinned. */
  pinnedAt: number;
}

/**
 * Persisted message record stored in IndexedDB for offline access.
 */
export interface StoredMessage {
  uid: string;
  chatId: string;
  provider: string;
  role: 'user' | 'assistant';
  text: string;
  ordinal: number;
  status: 'streaming' | 'complete';
  /** Timestamp of last update. */
  updatedAt: number;
}

/**
 * Binds a message UID to a DOM element for navigation.
 */
export interface LiveAnchor {
  uid: string;
  element: Element;

  /** Smooth-scrolls the element into view. */
  scrollIntoView(): void;

  /** Moves keyboard focus to the element or a focusable child for accessibility. */
  focusForA11y(): void;
}

/**
 * The core abstraction that all provider adapters implement.
 */
export interface SiteAdapter {
  /** Returns true if this adapter handles the given URL and document. */
  canHandle(url: URL, doc: Document): boolean;

  /** Extracts context about the current conversation. */
  getChatContext(doc: Document): ChatContext | null;

  /** Scans the DOM and returns all currently visible messages. */
  scanVisible(doc: Document): ObservedMessage[];

  /**
   * Attaches a MutationObserver and calls onUpdate when messages change.
   * Returns a cleanup function that disconnects the observer.
   */
  observe(doc: Document, onUpdate: (messages: ObservedMessage[]) => void): () => void;

  /**
   * Given an ObservedMessage, returns a LiveAnchor bound to the DOM element.
   * Returns null if the element is no longer in the DOM.
   */
  materializeMessage(msg: ObservedMessage, doc: Document): LiveAnchor | null;

  /** Returns true if the adapter's expected DOM structure is still present. */
  healthcheck(doc: Document): boolean;
}
