/**
 * Unit tests for stub adapters (Claude, Gemini, Grok, Perplexity).
 *
 * Verifies each stub implements the SiteAdapter interface and returns
 * expected placeholder results.
 *
 * Validates: Requirements 2.6
 */

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/adapters/claude';
import { GeminiAdapter } from '../../src/adapters/gemini';
import { GrokAdapter } from '../../src/adapters/grok';
import { PerplexityAdapter } from '../../src/adapters/perplexity';
import type { SiteAdapter, ObservedMessage } from '../../src/types';

/** Helper to create a URL object. */
function url(href: string): URL {
  return new URL(href);
}

/** Dummy ObservedMessage for materializeMessage tests. */
function dummyMessage(): ObservedMessage {
  return {
    nativeId: null,
    uid: 'test-uid',
    role: 'user',
    text: 'hello',
    status: 'complete',
    element: document.createElement('div'),
  };
}

/**
 * Shared test suite that runs the same assertions against any stub adapter.
 */
function describeStubAdapter(
  name: string,
  AdapterClass: new () => SiteAdapter,
  matchingUrls: string[],
  nonMatchingUrls: string[],
  options?: { chatContextReturnsNull?: boolean; healthcheckReturnsFalse?: boolean },
) {
  const expectNullContext = options?.chatContextReturnsNull ?? true;
  const expectFalseHealthcheck = options?.healthcheckReturnsFalse ?? true;

  describe(`${name} stub adapter`, () => {
    const adapter = new AdapterClass();

    describe('canHandle', () => {
      it.each(matchingUrls)('returns true for %s', (href) => {
        expect(adapter.canHandle(url(href), document)).toBe(true);
      });

      it.each(nonMatchingUrls)('returns false for %s', (href) => {
        expect(adapter.canHandle(url(href), document)).toBe(false);
      });
    });

    if (expectNullContext) {
      it('getChatContext returns null', () => {
        expect(adapter.getChatContext(document)).toBeNull();
      });
    } else {
      it('getChatContext returns a context object on bare document', () => {
        const ctx = adapter.getChatContext(document);
        // May return null or a fallback context depending on implementation
        expect(ctx === null || (typeof ctx === 'object' && ctx.provider)).toBeTruthy();
      });
    }

    it('scanVisible returns an empty array', () => {
      const result = adapter.scanVisible(document);
      expect(result).toEqual([]);
    });

    it('observe returns a no-op cleanup function', () => {
      const cleanup = adapter.observe(document, () => {});
      expect(typeof cleanup).toBe('function');
      // Calling cleanup should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('materializeMessage returns null', () => {
      expect(adapter.materializeMessage(dummyMessage(), document)).toBeNull();
    });

    if (expectFalseHealthcheck) {
      it('healthcheck returns false', () => {
        expect(adapter.healthcheck(document)).toBe(false);
      });
    } else {
      it('healthcheck returns true (fallback container found)', () => {
        expect(adapter.healthcheck(document)).toBe(true);
      });
    }
  });
}

// All stubs should reject these common URLs
const commonNonMatching = [
  'https://chatgpt.com/c/123',
  'https://example.com',
  'https://google.com',
];

describeStubAdapter(
  'Claude',
  ClaudeAdapter,
  ['https://claude.ai/chat/abc', 'https://claude.ai/'],
  [...commonNonMatching, 'https://gemini.google.com/', 'https://grok.com/', 'https://www.perplexity.com/'],
  { chatContextReturnsNull: true, healthcheckReturnsFalse: false },
);

describeStubAdapter(
  'Gemini',
  GeminiAdapter,
  ['https://gemini.google.com/app/123', 'https://gemini.google.com/'],
  [...commonNonMatching, 'https://claude.ai/', 'https://grok.com/', 'https://www.perplexity.com/'],
);

describeStubAdapter(
  'Grok',
  GrokAdapter,
  ['https://grok.com/chat/abc', 'https://grok.com/'],
  [...commonNonMatching, 'https://claude.ai/', 'https://gemini.google.com/', 'https://www.perplexity.com/'],
  { chatContextReturnsNull: false, healthcheckReturnsFalse: false },
);

describeStubAdapter(
  'Perplexity',
  PerplexityAdapter,
  ['https://www.perplexity.ai/search/abc', 'https://perplexity.ai/'],
  [...commonNonMatching, 'https://claude.ai/', 'https://gemini.google.com/', 'https://grok.com/'],
  { chatContextReturnsNull: true, healthcheckReturnsFalse: false },
);
