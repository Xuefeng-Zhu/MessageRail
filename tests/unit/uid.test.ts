import { describe, it, expect } from 'vitest';
import { textChecksum, generateUID, generateStreamingUID } from '../../src/utils/uid';

describe('textChecksum', () => {
  it('returns an 8-character hex string', () => {
    const result = textChecksum('hello world');
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same hash for the same input', () => {
    expect(textChecksum('hello')).toBe(textChecksum('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(textChecksum('hello')).not.toBe(textChecksum('world'));
  });

  it('handles empty string', () => {
    const result = textChecksum('');
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles single character', () => {
    const result = textChecksum('a');
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is sensitive to character order', () => {
    expect(textChecksum('ab')).not.toBe(textChecksum('ba'));
  });
});

describe('generateUID', () => {
  it('produces a deterministic UID for the same inputs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    expect(uid1).toBe(uid2);
  });

  it('produces different UIDs when provider differs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('claude', 'chat-123', 'user', 1, 'Hello');
    expect(uid1).not.toBe(uid2);
  });

  it('produces different UIDs when chatId differs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('chatgpt', 'chat-456', 'user', 1, 'Hello');
    expect(uid1).not.toBe(uid2);
  });

  it('produces different UIDs when role differs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('chatgpt', 'chat-123', 'assistant', 1, 'Hello');
    expect(uid1).not.toBe(uid2);
  });

  it('produces different UIDs when ordinal differs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('chatgpt', 'chat-123', 'user', 2, 'Hello');
    expect(uid1).not.toBe(uid2);
  });

  it('produces different UIDs when text differs', () => {
    const uid1 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const uid2 = generateUID('chatgpt', 'chat-123', 'user', 1, 'Goodbye');
    expect(uid1).not.toBe(uid2);
  });

  it('includes the text checksum in the UID', () => {
    const uid = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    const checksum = textChecksum('Hello');
    expect(uid).toContain(checksum);
  });

  it('includes all components in the UID', () => {
    const uid = generateUID('chatgpt', 'chat-123', 'user', 1, 'Hello');
    expect(uid).toContain('chatgpt');
    expect(uid).toContain('chat-123');
    expect(uid).toContain('user');
    expect(uid).toContain('1');
  });
});

describe('generateStreamingUID', () => {
  it('produces a deterministic UID for the same inputs', () => {
    const uid1 = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    const uid2 = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    expect(uid1).toBe(uid2);
  });

  it('does not include a text checksum', () => {
    const uid = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    // The streaming UID should use 'streaming' as the last segment, not a hex checksum
    expect(uid).toContain('streaming');
  });

  it('remains stable regardless of text content', () => {
    // Streaming UID doesn't take text, so it's inherently stable
    const uid = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    expect(uid).toBe('chatgpt:chat-123:assistant:2:streaming');
  });

  it('produces different UIDs when ordinal differs', () => {
    const uid1 = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 1);
    const uid2 = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    expect(uid1).not.toBe(uid2);
  });

  it('produces different UIDs when role differs', () => {
    const uid1 = generateStreamingUID('chatgpt', 'chat-123', 'user', 1);
    const uid2 = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 1);
    expect(uid1).not.toBe(uid2);
  });

  it('produces a different UID than generateUID for the same base fields', () => {
    const streamingUid = generateStreamingUID('chatgpt', 'chat-123', 'assistant', 2);
    const completeUid = generateUID('chatgpt', 'chat-123', 'assistant', 2, 'Some text');
    expect(streamingUid).not.toBe(completeUid);
  });
});
