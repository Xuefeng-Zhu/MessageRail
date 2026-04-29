import type { SiteAdapter } from '../types';

/**
 * Maintains a list of registered SiteAdapters and selects the first
 * matching adapter for a given URL and document.
 */
export class AdapterRegistry {
  private adapters: SiteAdapter[] = [];

  /**
   * Registers a SiteAdapter. The adapter will be considered during
   * subsequent `getAdapter` calls in registration order.
   */
  register(adapter: SiteAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Iterates registered adapters and returns the first whose
   * `canHandle` returns true for the given URL and document.
   * Returns null if no adapter matches.
   */
  getAdapter(url: URL, doc: Document): SiteAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(url, doc)) {
        return adapter;
      }
    }
    return null;
  }
}
