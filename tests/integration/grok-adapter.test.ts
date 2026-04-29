import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GrokAdapter } from '../../src/adapters/grok';

const FIXTURE_PATH = resolve(__dirname, '../fixtures/grok-basic.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf-8');

function loadFixture(): Document {
  document.documentElement.innerHTML = '';
  const parser = new DOMParser();
  const fixtureDoc = parser.parseFromString(FIXTURE_HTML, 'text/html');
  document.documentElement.innerHTML = fixtureDoc.documentElement.innerHTML;

  Object.defineProperty(document, 'URL', {
    value: 'https://grok.com/c/test-grok-123?rid=response-grok-002',
    writable: true,
    configurable: true,
  });

  return document;
}

describe('Grok Adapter fixture integration', () => {
  let adapter: GrokAdapter;
  let doc: Document;

  beforeEach(() => {
    adapter = new GrokAdapter();
    doc = loadFixture();
  });

  afterEach(() => {
    Object.defineProperty(document, 'URL', {
      value: 'about:blank',
      writable: true,
      configurable: true,
    });
  });

  it('extracts context from Grok conversation URLs', () => {
    const ctx = adapter.getChatContext(doc);
    expect(ctx).not.toBeNull();
    expect(ctx!.provider).toBe('grok');
    expect(ctx!.chatId).toBe('test-grok-123');
  });

  it('extracts message-bubble user and assistant messages in DOM order', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(messages[0].text).toContain('content scripts run');
    expect(messages[1].text).toContain('isolated world');
    expect(messages[2].text).toContain('MutationObserver');
  });

  it('marks only the latest assistant bubble as streaming', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages[0].status).toBe('complete');
    expect(messages[1].status).toBe('complete');
    expect(messages[2].status).toBe('streaming');
  });

  it('uses response wrapper IDs as native assistant IDs', () => {
    const messages = adapter.scanVisible(doc);

    expect(messages[1].nativeId).toBe('response-grok-001');
    expect(messages[2].nativeId).toBe('response-grok-002');
  });

  it('reports healthy when the main chat container exists', () => {
    expect(adapter.healthcheck(doc)).toBe(true);
  });
});
