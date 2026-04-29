import type { IndexedMessage } from '../types';

/**
 * Finds the first assistant response associated with a user message.
 */
function findNextAssistant(messages: IndexedMessage[], userIndex: number): IndexedMessage | null {
  for (let i = userIndex + 1; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === 'user') {
      return null;
    }
    if (message.role === 'assistant') {
      return message;
    }
  }
  return null;
}

/**
 * Filters indexed messages for the sidebar's user-message-first display.
 *
 * The sidebar renders user messages as rows and shows the paired assistant
 * response as preview text. If search matches assistant text, keep the
 * owning user row and its assistant preview so the result remains visible.
 */
export function filterMessagesForSidebarSearch(
  allMessages: IndexedMessage[],
  searchResults: IndexedMessage[],
): IndexedMessage[] {
  const matchedUids = new Set(searchResults.map((message) => message.uid));
  if (matchedUids.size === 0) {
    return [];
  }

  const filtered: IndexedMessage[] = [];
  for (let i = 0; i < allMessages.length; i++) {
    const message = allMessages[i];
    if (message.role !== 'user') {
      continue;
    }

    const assistant = findNextAssistant(allMessages, i);
    const userMatches = matchedUids.has(message.uid);
    const assistantMatches = assistant ? matchedUids.has(assistant.uid) : false;

    if (userMatches || assistantMatches) {
      filtered.push(message);
      if (assistant) {
        filtered.push(assistant);
      }
    }
  }

  return filtered;
}
