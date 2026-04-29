/**
 * Text normalization utilities for MessageRail.
 *
 * Normalizes message text by trimming whitespace and collapsing
 * consecutive whitespace characters into a single space.
 */

/**
 * Trims leading/trailing whitespace and collapses consecutive
 * whitespace characters (spaces, tabs, newlines) into a single space.
 *
 * @param text - The raw message text to normalize.
 * @returns The normalized text string.
 */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
