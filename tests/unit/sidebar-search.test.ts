import { describe, it, expect } from 'vitest';
import { filterMessagesForSidebarSearch } from '../../src/ui/sidebar-search';
import type { IndexedMessage } from '../../src/types';

function makeMessage(overrides: Partial<IndexedMessage> = {}): IndexedMessage {
  return {
    uid: 'uid-1',
    nativeId: null,
    role: 'user',
    text: 'hello',
    preview: 'hello',
    ordinal: 1,
    status: 'complete',
    pinned: false,
    ...overrides,
  };
}

describe('filterMessagesForSidebarSearch', () => {
  it('keeps a matching user message and its paired assistant preview', () => {
    const user = makeMessage({ uid: 'u1', role: 'user', ordinal: 1, text: 'IndexedDB question' });
    const assistant = makeMessage({ uid: 'a1', role: 'assistant', ordinal: 2, text: 'Storage answer' });
    const otherUser = makeMessage({ uid: 'u2', role: 'user', ordinal: 3, text: 'Other question' });
    const all = [user, assistant, otherUser];

    expect(filterMessagesForSidebarSearch(all, [user])).toEqual([user, assistant]);
  });

  it('keeps the owning user row when search matches assistant text', () => {
    const user = makeMessage({ uid: 'u1', role: 'user', ordinal: 1, text: 'Question' });
    const assistant = makeMessage({ uid: 'a1', role: 'assistant', ordinal: 2, text: 'Needle answer' });
    const all = [user, assistant];

    expect(filterMessagesForSidebarSearch(all, [assistant])).toEqual([user, assistant]);
  });

  it('does not pair an assistant across the next user boundary', () => {
    const user = makeMessage({ uid: 'u1', role: 'user', ordinal: 1 });
    const nextUser = makeMessage({ uid: 'u2', role: 'user', ordinal: 2 });
    const assistant = makeMessage({ uid: 'a2', role: 'assistant', ordinal: 3 });
    const all = [user, nextUser, assistant];

    expect(filterMessagesForSidebarSearch(all, [user])).toEqual([user]);
  });

  it('returns an empty list when there are no matching messages', () => {
    const all = [
      makeMessage({ uid: 'u1', role: 'user', ordinal: 1 }),
      makeMessage({ uid: 'a1', role: 'assistant', ordinal: 2 }),
    ];

    expect(filterMessagesForSidebarSearch(all, [])).toEqual([]);
  });
});
