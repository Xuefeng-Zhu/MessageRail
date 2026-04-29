/**
 * IndexedDB storage layer for MessageRail.
 *
 * Persists message records and pin metadata in a local IndexedDB database.
 * Falls back to in-memory-only operation if IndexedDB is unavailable
 * (e.g., private browsing, quota exceeded).
 *
 * Requirements: 10.1, 10.3, 10.4, 10.5
 */

import type { PinRecord, StoredMessage } from '../types';

export class IndexedDBStore {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'messagerail';
  private readonly DB_VERSION = 1;

  /**
   * Opens the IndexedDB database and creates object stores on first run.
   * If open fails, the store operates in degraded mode (all operations
   * become no-ops or return empty results).
   */
  async open(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains('messages')) {
            const messagesStore = db.createObjectStore('messages', { keyPath: 'uid' });
            messagesStore.createIndex('chatId', 'chatId', { unique: false });
          }

          if (!db.objectStoreNames.contains('pins')) {
            const pinsStore = db.createObjectStore('pins', { keyPath: 'uid' });
            pinsStore.createIndex('chatId', 'chatId', { unique: false });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('IndexedDBStore: failed to open database, operating in degraded mode', err);
      this.db = null;
    }
  }

  /**
   * Persists a pin record. Retries once on failure.
   */
  async putPin(pin: PinRecord): Promise<void> {
    await this.writeWithRetry('pins', 'put', pin);
  }

  /**
   * Removes a pin record by UID.
   */
  async deletePin(uid: string): Promise<void> {
    if (!this.db) return;

    try {
      await this.performDelete('pins', uid);
    } catch {
      // Single attempt for deletes — no retry needed
    }
  }

  /**
   * Returns all pin records for a given chat ID using the chatId index.
   */
  async getPinsByChatId(chatId: string): Promise<PinRecord[]> {
    return this.queryByIndex<PinRecord>('pins', 'chatId', chatId);
  }

  /**
   * Persists a batch of message records. Retries once on failure.
   */
  async putMessages(messages: StoredMessage[]): Promise<void> {
    if (!this.db || messages.length === 0) return;

    const attempt = () =>
      new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');

        for (const msg of messages) {
          store.put(msg);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

    try {
      await attempt();
    } catch (err) {
      // Retry once
      try {
        await attempt();
      } catch (retryErr) {
        console.warn('IndexedDBStore: putMessages failed after retry', retryErr);
      }
    }
  }

  /**
   * Returns all stored messages for a given chat ID using the chatId index.
   */
  async getMessagesByChatId(chatId: string): Promise<StoredMessage[]> {
    return this.queryByIndex<StoredMessage>('messages', 'chatId', chatId);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Performs a single write (put) with one retry on failure.
   */
  private async writeWithRetry(
    storeName: string,
    _method: 'put',
    record: unknown,
  ): Promise<void> {
    if (!this.db) return;

    const attempt = () =>
      new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

    try {
      await attempt();
    } catch (err) {
      // Retry once
      try {
        await attempt();
      } catch (retryErr) {
        console.warn(`IndexedDBStore: write to "${storeName}" failed after retry`, retryErr);
      }
    }
  }

  /**
   * Deletes a record by key from the given object store.
   */
  private performDelete(storeName: string, key: string): Promise<void> {
    if (!this.db) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * Queries an object store by index and returns all matching records.
   * Returns an empty array if the database is not available.
   */
  private queryByIndex<T>(
    storeName: string,
    indexName: string,
    value: string,
  ): Promise<T[]> {
    if (!this.db) return Promise.resolve([]);

    return new Promise<T[]>((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }
}
