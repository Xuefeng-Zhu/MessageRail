// Feature: messagerail-extension, Property 1: Adapter Registry Selection
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AdapterRegistry } from '../../src/adapters/registry';
import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../../src/types';

/**
 * Creates a stub SiteAdapter whose `canHandle` returns true only when
 * the URL's hostname matches the given hostname.
 */
function createStubAdapter(hostname: string): SiteAdapter {
  return {
    canHandle(url: URL, _doc: Document): boolean {
      return url.hostname === hostname;
    },
    getChatContext(_doc: Document): ChatContext | null {
      return null;
    },
    scanVisible(_doc: Document): ObservedMessage[] {
      return [];
    },
    observe(_doc: Document, _onUpdate: (messages: ObservedMessage[]) => void): () => void {
      return () => {};
    },
    materializeMessage(_msg: ObservedMessage, _doc: Document): LiveAnchor | null {
      return null;
    },
    healthcheck(_doc: Document): boolean {
      return true;
    },
  };
}

/**
 * Arbitrary that generates a valid hostname string (lowercase alpha label + TLD).
 */
const arbHostname = fc
  .tuple(
    fc.array(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 3 }),
    fc.constantFrom('com', 'ai', 'org', 'net', 'io')
  )
  .map(([parts, tld]) => [...parts, tld].join('.'));

/**
 * Arbitrary that generates a valid URL from a hostname.
 */
const arbUrl = arbHostname.chain((hostname) =>
  fc
    .stringMatching(/^[a-z0-9]{0,10}$/)
    .map((path) => new URL(`https://${hostname}/${path}`))
);

describe('Property 1: Adapter Registry Selection', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * For any set of registered adapters and for any URL, the AdapterRegistry
   * SHALL return the first adapter whose `canHandle` returns true for that URL,
   * or null if no adapter matches.
   */
  it('returns the first adapter whose canHandle returns true, or null if none match', () => {
    fc.assert(
      fc.property(
        // Generate a list of hostnames for adapters
        fc.array(arbHostname, { minLength: 0, maxLength: 10 }),
        // Generate a URL to query
        arbUrl,
        (adapterHostnames, queryUrl) => {
          const registry = new AdapterRegistry();
          const adapters = adapterHostnames.map((h) => createStubAdapter(h));

          for (const adapter of adapters) {
            registry.register(adapter);
          }

          const result = registry.getAdapter(queryUrl, document);

          // Find the expected adapter: the first one whose hostname matches the query URL
          const expectedIndex = adapterHostnames.findIndex((h) => queryUrl.hostname === h);

          if (expectedIndex === -1) {
            // No adapter matches — registry should return null
            expect(result).toBeNull();
          } else {
            // Registry should return the first matching adapter (by reference)
            expect(result).toBe(adapters[expectedIndex]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null when no adapters are registered regardless of URL', () => {
    fc.assert(
      fc.property(arbUrl, (queryUrl) => {
        const registry = new AdapterRegistry();
        const result = registry.getAdapter(queryUrl, document);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('returns the first matching adapter when multiple adapters can handle the same URL', () => {
    fc.assert(
      fc.property(
        arbHostname,
        // Generate how many duplicate adapters to register (at least 2)
        fc.integer({ min: 2, max: 5 }),
        (hostname, count) => {
          const registry = new AdapterRegistry();
          const adapters: SiteAdapter[] = [];

          for (let i = 0; i < count; i++) {
            const adapter = createStubAdapter(hostname);
            adapters.push(adapter);
            registry.register(adapter);
          }

          const url = new URL(`https://${hostname}/test`);
          const result = registry.getAdapter(url, document);

          // Should always return the first registered adapter
          expect(result).toBe(adapters[0]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
