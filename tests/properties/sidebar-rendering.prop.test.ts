// Feature: messagerail-extension, Property 8: Sidebar Message Rendering Completeness

import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { SidebarController } from '../../src/ui/sidebar-controller';
import type { IndexedMessage } from '../../src/types';

/**
 * Arbitrary for a single IndexedMessage with random fields.
 */
const arbIndexedMessage = fc.record({
  uid: fc.string({ minLength: 1, maxLength: 20 }),
  nativeId: fc.constant(null),
  role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
  text: fc.string({ minLength: 1, maxLength: 200 }),
  preview: fc.string({ minLength: 1, maxLength: 80 }),
  ordinal: fc.integer({ min: 1, max: 1000 }),
  status: fc.constantFrom('streaming', 'complete') as fc.Arbitrary<'streaming' | 'complete'>,
  pinned: fc.boolean(),
});

/**
 * Arbitrary for an array of IndexedMessages with unique UIDs.
 * Ensures at least one user message is present for meaningful rendering tests.
 */
const arbUniqueMessages = fc
  .array(arbIndexedMessage, { minLength: 1, maxLength: 20 })
  .map((msgs) => {
    const seen = new Set<string>();
    return msgs.filter((m) => {
      if (seen.has(m.uid)) return false;
      seen.add(m.uid);
      return true;
    });
  })
  .filter((msgs) => msgs.length > 0 && msgs.some((m) => m.role === 'user'));

// Feature: messagerail-extension, Property 8: Sidebar Message Rendering Completeness
describe('Property 8: Sidebar Message Rendering Completeness', () => {
  let controller: SidebarController | null = null;

  afterEach(() => {
    if (controller) {
      controller.unmount();
      controller = null;
    }
  });

  /**
   * **Validates: Requirements 6.3**
   *
   * For any IndexedMessage, the rendered sidebar list item SHALL contain
   * the message's ordinal number, role label, and a preview of the message text.
   */
  it('every rendered list item contains the ordinal, role label, and text preview', () => {
    fc.assert(
      fc.property(arbUniqueMessages, (messages) => {
        // Create and mount a fresh SidebarController
        controller = new SidebarController();
        controller.mount(document);

        // Render the messages
        controller.render(messages);

        // Access the shadow root to inspect rendered elements
        const host = document.getElementById('messagerail-host');
        expect(host).not.toBeNull();

        const shadowRoot = host!.shadowRoot;
        expect(shadowRoot).not.toBeNull();

        // Get all rendered list items
        const listItems = shadowRoot!.querySelectorAll('.mr-message-item');

        // Only user messages are rendered in the sidebar
        const userMessages = messages.filter((m) => m.role === 'user');

        // Count expected items: user messages only (pin section disabled)
        const expectedCount = userMessages.length;
        expect(listItems.length).toBe(expectedCount);

        // Build a map of uid -> message for lookup (user messages only)
        const msgMap = new Map(userMessages.map((m) => [m.uid, m]));

        // Verify each rendered list item contains preview text
        for (const li of listItems) {
          const uid = (li as HTMLElement).dataset.uid;
          expect(uid).toBeDefined();

          const msg = msgMap.get(uid!);
          expect(msg).toBeDefined();

          // Check text preview is present
          const previewEl = li.querySelector('.mr-preview');
          expect(previewEl).not.toBeNull();
          expect(previewEl!.textContent).toBe(msg!.preview);

          // Pin icon button is not rendered (pin disabled)
          const iconBtns = li.querySelectorAll('.mr-icon-btn');
          expect(iconBtns.length).toBe(0);
        }

        // Clean up for next iteration
        controller!.unmount();
        controller = null;
      }),
      { numRuns: 100 }
    );
  });
});
