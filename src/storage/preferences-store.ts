/**
 * Lightweight preferences storage for MessageRail.
 *
 * Wraps `chrome.storage.local` for persisting user preferences such as
 * sidebar collapsed state. Falls back to an in-memory Map when
 * `chrome.storage.local` is unavailable (e.g., running outside the
 * extension context, or in test environments).
 *
 * Requirements: 10.2
 */

/** Hardcoded default values for known preference keys. */
const DEFAULTS: Record<string, unknown> = {
  sidebarCollapsed: false,
};

export class PreferencesStore {
  private memoryFallback: Map<string, unknown> = new Map();

  /**
   * Returns true if `chrome.storage.local` is available in the current
   * environment.
   */
  private hasStorage(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      chrome?.storage?.local !== undefined &&
      chrome?.storage?.local !== null
    );
  }

  /**
   * Gets a preference value by key.
   *
   * Resolution order:
   * 1. `chrome.storage.local` (if available)
   * 2. In-memory fallback map
   * 3. Hardcoded defaults
   * 4. `undefined`
   */
  async get<T>(key: string): Promise<T | undefined> {
    if (this.hasStorage()) {
      try {
        const result = await chrome.storage.local.get(key);
        if (key in result) {
          return result[key] as T;
        }
      } catch {
        // Storage read failed — fall through to defaults
      }
    }

    // Check in-memory fallback
    if (this.memoryFallback.has(key)) {
      return this.memoryFallback.get(key) as T;
    }

    // Check hardcoded defaults
    if (key in DEFAULTS) {
      return DEFAULTS[key] as T;
    }

    return undefined;
  }

  /**
   * Sets a preference value.
   *
   * Writes to `chrome.storage.local` when available. If storage is
   * unavailable, the value is stored in the in-memory fallback map
   * for the duration of the session.
   */
  async set<T>(key: string, value: T): Promise<void> {
    if (this.hasStorage()) {
      try {
        await chrome.storage.local.set({ [key]: value });
        return;
      } catch {
        // Storage write failed — fall through to in-memory
      }
    }

    this.memoryFallback.set(key, value);
  }
}
