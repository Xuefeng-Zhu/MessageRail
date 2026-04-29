import { describe, it, expect } from 'vitest';

describe('Test infrastructure', () => {
  it('vitest runs with jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});
