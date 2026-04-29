import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PerplexityAdapter } from '../../src/adapters/perplexity';

const FIXTURE_PATH = resolve(__dirname, '../fixtures/perplexity-basic.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf-8');

function loadFixture(): Document {
  document.documentElement.innerHTML = '';
  const parser = new DOMParser();
  const fixtureDoc = parser.parseFromString(FIXTURE_HTML, 'text/html');
  document.documentElement.innerHTML = fixtureDoc.documentElement.innerHTML;

  Object.defineProperty(document, 'URL', {
    value: 'https://www.perplexity.ai/search/test-thread-123',
    writable: true,
    configurable: true,
  });

  return document;
}

describe('Perplexity Adapter fixture integration', () => {
  let adapter: PerplexityAdapter;
  let doc: Document;

  beforeEach(() => {
    adapter = new PerplexityAdapter();
    doc = loadFixture();
  });

  afterEach(() => {
    Object.defineProperty(document, 'URL', {
      value: 'about:blank',
      writable: true,
      configurable: true,
    });
  });

  it('extracts context from Perplexity search URLs', () => {
    const ctx = adapter.getChatContext(doc);
    expect(ctx).not.toBeNull();
    expect(ctx!.provider).toBe('perplexity');
    expect(ctx!.chatId).toBe('test-thread-123');
  });

  it('extracts group title queries and markdown answers in DOM order', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages).toHaveLength(4);
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(messages[0].text).toContain('IndexedDB');
    expect(messages[1].text).toContain('structured data');
    expect(messages[2].text).toContain('content script');
    expect(messages[3].text).toContain('MutationObserver');
  });

  it('marks only the latest assistant answer as streaming', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages[0].status).toBe('complete');
    expect(messages[1].status).toBe('complete');
    expect(messages[2].status).toBe('complete');
    expect(messages[3].status).toBe('streaming');
  });

  it('uses markdown content IDs as native assistant IDs', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages[1].nativeId).toBe('markdown-content-0');
    expect(messages[3].nativeId).toBe('markdown-content-1');
  });

  it('reports healthy when the main chat container exists', () => {
    expect(adapter.healthcheck(doc)).toBe(true);
  });
});
