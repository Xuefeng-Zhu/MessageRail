// Feature: messagerail-extension, Property 4: Text Normalization Correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizeText } from '../../src/utils/normalize';

describe('Property 4: Text Normalization Correctness', () => {
  /**
   * **Validates: Requirements 5.3, 14.1, 14.2**
   *
   * For any input string, normalizeText SHALL produce output that has
   * no leading or trailing whitespace and contains no consecutive
   * whitespace characters (spaces, tabs, or newlines).
   */
  it('output has no leading/trailing whitespace and no consecutive whitespace for any input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeText(input);

        // No leading whitespace
        expect(result).toBe(result.trimStart());

        // No trailing whitespace
        expect(result).toBe(result.trimEnd());

        // No consecutive whitespace characters (spaces, tabs, or newlines)
        expect(result).not.toMatch(/\s{2,}/);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: messagerail-extension, Property 5: Text Normalization Idempotence
describe('Property 5: Text Normalization Idempotence', () => {
  /**
   * **Validates: Requirements 14.5, 16.6**
   *
   * For any input string, applying normalizeText once and then applying
   * it again SHALL produce the same result as a single application:
   * normalizeText(normalizeText(x)) === normalizeText(x).
   */
  it('normalizing twice produces the same result as normalizing once', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = normalizeText(input);
        const twice = normalizeText(once);

        expect(twice).toBe(once);
      }),
      { numRuns: 100 }
    );
  });
});
