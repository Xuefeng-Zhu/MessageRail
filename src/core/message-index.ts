/**
 * MessageIndex — manages the ordered collection of messages,
 * ordinal assignment, deduplication, search, and pinning.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.3, 8.5, 9.1, 9.5, 15.3
 */

import type { ObservedMessage, IndexedMessage } from '../types';
import { normalizeText } from '../utils/normalize';
import { generateUID, generateStreamingUID } from '../utils/uid';

/** Maximum characters for the message preview. */
const PREVIEW_LENGTH = 80;

/**
 * Generates a short preview string from normalized text.
 * Truncates at ~80 characters, appending an ellipsis if needed.
 */
function makePreview(normalizedText: string): string {
  if (normalizedText.length <= PREVIEW_LENGTH) {
    return normalizedText;
  }
  return normalizedText.slice(0, PREVIEW_LENGTH) + '…';
}

export class MessageIndex {
  /** Map of UID → IndexedMessage for fast lookup and deduplication. */
  private messages: Map<string, IndexedMessage> = new Map();

  /** Tracks the next ordinal to assign. */
  private ordinalCounter: number = 1;

  /** Provider identifier for UID generation. */
  private provider: string = '';

  /** Chat ID for UID generation. */
  private chatId: string = '';

  /** Set of pinned UIDs (in-memory). */
  private pinnedUids: Set<string> = new Set();

  /**
   * Sets the chat context needed for UID generation.
   * Should be called before the first `update`.
   */
  setChatContext(provider: string, chatId: string): void {
    this.provider = provider;
    this.chatId = chatId;
  }

  /**
   * Ingests raw ObservedMessages, normalizes text, assigns ordinals,
   * and deduplicates by UID.
   *
   * For each incoming message:
   * - Normalize the text
   * - Assign a sequential ordinal (starting from 1) based on position
   * - Generate a UID (streaming or complete)
   * - Deduplicate: if a message with the same UID exists, update in-place
   * - Handle streaming → complete transitions: replace the streaming entry
   *   with a new complete-form UID
   *
   * Requirements: 5.1, 5.2, 5.3, 5.4, 15.3
   */
  update(incoming: ObservedMessage[]): void {
    for (let i = 0; i < incoming.length; i++) {
      const msg = incoming[i];
      const normalized = normalizeText(msg.text);
      const preview = makePreview(normalized);
      const ordinal = i + 1;

      // Generate the appropriate UID based on status
      const uid =
        msg.status === 'streaming'
          ? generateStreamingUID(this.provider, this.chatId, msg.role, ordinal)
          : generateUID(this.provider, this.chatId, msg.role, ordinal, normalized);

      // Check if there's an existing streaming entry at this ordinal
      // that is now transitioning to complete
      const streamingUid = generateStreamingUID(
        this.provider,
        this.chatId,
        msg.role,
        ordinal
      );

      if (msg.status === 'complete' && this.messages.has(streamingUid)) {
        // Streaming → complete transition: remove the old streaming entry,
        // preserve pin state
        const oldEntry = this.messages.get(streamingUid)!;
        const wasPinned = oldEntry.pinned;
        this.messages.delete(streamingUid);

        if (wasPinned) {
          this.pinnedUids.delete(streamingUid);
          this.pinnedUids.add(uid);
        }
      }

      // Deduplicate: update existing entry in-place or create new
      if (this.messages.has(uid)) {
        const existing = this.messages.get(uid)!;
        existing.text = normalized;
        existing.preview = preview;
        existing.status = msg.status;
        existing.nativeId = msg.nativeId;
        // Ordinal stays stable — don't change it
      } else {
        // Assign ordinal: use the position-based ordinal, but only
        // advance the counter if this is a genuinely new message
        const assignedOrdinal = ordinal;
        if (ordinal >= this.ordinalCounter) {
          this.ordinalCounter = ordinal + 1;
        }

        const indexed: IndexedMessage = {
          uid,
          nativeId: msg.nativeId,
          role: msg.role,
          text: normalized,
          preview,
          ordinal: assignedOrdinal,
          status: msg.status,
          pinned: this.pinnedUids.has(uid),
        };

        this.messages.set(uid, indexed);
      }
    }
  }

  /**
   * Returns all indexed messages sorted by ordinal.
   *
   * Requirements: 5.1
   */
  getAll(): IndexedMessage[] {
    return Array.from(this.messages.values()).sort(
      (a, b) => a.ordinal - b.ordinal
    );
  }

  /**
   * Returns messages whose normalized text contains the query
   * as a case-insensitive substring.
   *
   * Requirements: 8.3, 8.5
   */
  search(query: string): IndexedMessage[] {
    if (!query) {
      return this.getAll();
    }
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((msg) =>
      msg.text.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Toggles the pin state for a message identified by UID.
   * Returns a Promise for future IndexedDB integration.
   *
   * Requirements: 9.1, 9.5
   */
  async togglePin(uid: string): Promise<void> {
    const msg = this.messages.get(uid);
    if (!msg) {
      return;
    }

    if (this.pinnedUids.has(uid)) {
      this.pinnedUids.delete(uid);
      msg.pinned = false;
    } else {
      this.pinnedUids.add(uid);
      msg.pinned = true;
    }

    // Storage persistence will be wired in a later task
  }

  /**
   * Returns all pinned messages sorted by ordinal.
   *
   * Requirements: 9.1
   */
  getPinned(): IndexedMessage[] {
    return this.getAll().filter((msg) => msg.pinned);
  }

  /**
   * Loads persisted pins from storage for the given chat ID.
   * Placeholder — actual IndexedDB integration comes in a later task.
   *
   * Requirements: 9.5
   */
  async loadPins(_chatId: string): Promise<void> {
    // No-op for now; storage integration wired in task 8
  }
}
