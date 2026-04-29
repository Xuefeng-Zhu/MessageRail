import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry';
import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../../src/types';

/**
 * Creates a minimal stub SiteAdapter that matches URLs with the given hostname.
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

describe('AdapterRegistry', () => {
  it('returns null when no adapters are registered', () => {
    const registry = new AdapterRegistry();
    const url = new URL('https://chatgpt.com/c/123');
    const result = registry.getAdapter(url, document);
    expect(result).toBeNull();
  });

  it('returns the matching adapter for a known URL', () => {
    const registry = new AdapterRegistry();
    const chatgptAdapter = createStubAdapter('chatgpt.com');
    registry.register(chatgptAdapter);

    const url = new URL('https://chatgpt.com/c/123');
    const result = registry.getAdapter(url, document);
    expect(result).toBe(chatgptAdapter);
  });

  it('returns null when no adapter matches the URL', () => {
    const registry = new AdapterRegistry();
    registry.register(createStubAdapter('chatgpt.com'));

    const url = new URL('https://unknown-site.com/page');
    const result = registry.getAdapter(url, document);
    expect(result).toBeNull();
  });

  it('returns the first matching adapter when multiple adapters match', () => {
    const registry = new AdapterRegistry();
    const first = createStubAdapter('chatgpt.com');
    const second = createStubAdapter('chatgpt.com');
    registry.register(first);
    registry.register(second);

    const url = new URL('https://chatgpt.com/c/123');
    const result = registry.getAdapter(url, document);
    expect(result).toBe(first);
  });

  it('selects the correct adapter among multiple registered adapters', () => {
    const registry = new AdapterRegistry();
    const chatgpt = createStubAdapter('chatgpt.com');
    const claude = createStubAdapter('claude.ai');
    const gemini = createStubAdapter('gemini.google.com');
    registry.register(chatgpt);
    registry.register(claude);
    registry.register(gemini);

    expect(registry.getAdapter(new URL('https://chatgpt.com/c/1'), document)).toBe(chatgpt);
    expect(registry.getAdapter(new URL('https://claude.ai/chat/2'), document)).toBe(claude);
    expect(registry.getAdapter(new URL('https://gemini.google.com/app/3'), document)).toBe(gemini);
  });

  it('allows registering adapters incrementally', () => {
    const registry = new AdapterRegistry();
    const url = new URL('https://claude.ai/chat/1');

    expect(registry.getAdapter(url, document)).toBeNull();

    const claude = createStubAdapter('claude.ai');
    registry.register(claude);

    expect(registry.getAdapter(url, document)).toBe(claude);
  });
});
