/**
 * Gemini SiteAdapter stub for MessageRail.
 *
 * Placeholder adapter for gemini.google.com. Implements the SiteAdapter interface
 * with canHandle matching the Gemini domain; all other methods return
 * empty or placeholder results pending full implementation.
 */

import type { SiteAdapter, ChatContext, ObservedMessage, LiveAnchor } from '../types';

export class GeminiAdapter implements SiteAdapter {
  canHandle(url: URL, _doc: Document): boolean {
    return url.hostname === 'gemini.google.com';
  }

  getChatContext(_doc: Document): ChatContext | null {
    return null;
  }

  scanVisible(_doc: Document): ObservedMessage[] {
    return [];
  }

  observe(_doc: Document, _onUpdate: (messages: ObservedMessage[]) => void): () => void {
    return () => {};
  }

  materializeMessage(_msg: ObservedMessage, _doc: Document): LiveAnchor | null {
    return null;
  }

  healthcheck(_doc: Document): boolean {
    return false;
  }
}
