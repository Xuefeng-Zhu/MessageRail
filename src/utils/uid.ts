/**
 * UID generation utilities for MessageRail.
 *
 * Generates deterministic Message_UIDs from message components.
 * Uses FNV-1a hash for the text checksum component.
 */

/**
 * FNV-1a 32-bit hash constants.
 * @see https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Computes an FNV-1a 32-bit hash of the given text and returns
 * it as an 8-character zero-padded hexadecimal string.
 *
 * @param text - The input text to hash.
 * @returns A hex string representing the FNV-1a hash.
 */
export function textChecksum(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit integer, then to zero-padded hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generates a deterministic Message_UID from the given components.
 *
 * The UID is formed by joining provider, chatId, role, ordinal, and
 * a text checksum with a delimiter. Identical inputs always produce
 * the same UID, and differing inputs produce different UIDs.
 *
 * @param provider - Provider identifier (e.g., 'chatgpt', 'claude').
 * @param chatId - Conversation/chat ID.
 * @param role - Message role ('user' or 'assistant').
 * @param ordinal - Sequential message ordinal.
 * @param text - The message text content (used for checksum).
 * @returns A deterministic UID string.
 */
export function generateUID(
  provider: string,
  chatId: string,
  role: string,
  ordinal: number,
  text: string
): string {
  const checksum = textChecksum(text);
  return `${provider}:${chatId}:${role}:${ordinal}:${checksum}`;
}

/**
 * Generates a deterministic UID for streaming messages (status not complete).
 *
 * During streaming, the message text is still growing, so the UID is
 * derived from ordinal and role only — no text checksum. This ensures
 * the UID remains stable as the message text changes during streaming.
 *
 * @param provider - Provider identifier.
 * @param chatId - Conversation/chat ID.
 * @param role - Message role ('user' or 'assistant').
 * @param ordinal - Sequential message ordinal.
 * @returns A deterministic streaming UID string.
 */
export function generateStreamingUID(
  provider: string,
  chatId: string,
  role: string,
  ordinal: number
): string {
  return `${provider}:${chatId}:${role}:${ordinal}:streaming`;
}
