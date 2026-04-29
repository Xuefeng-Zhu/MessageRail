import { describe, it, expect } from 'vitest';
import { normalizeText } from '../../src/utils/normalize';

describe('normalizeText', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('collapses consecutive spaces into a single space', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('collapses tabs into a single space', () => {
    expect(normalizeText('hello\t\tworld')).toBe('hello world');
  });

  it('collapses newlines into a single space', () => {
    expect(normalizeText('hello\n\nworld')).toBe('hello world');
  });

  it('collapses mixed whitespace into a single space', () => {
    expect(normalizeText('hello \t\n  world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(normalizeText('   \t\n  ')).toBe('');
  });

  it('returns single word unchanged', () => {
    expect(normalizeText('hello')).toBe('hello');
  });

  it('handles string with no extra whitespace', () => {
    expect(normalizeText('hello world')).toBe('hello world');
  });
});
