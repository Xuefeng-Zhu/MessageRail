import { describe, it, expect, afterEach, vi } from 'vitest';
import { SidebarController } from '../../src/ui/sidebar-controller';
import type { IndexedMessage } from '../../src/types';

/**
 * Unit tests for SidebarController.
 * Validates: Requirements 6.3, 6.5, 6.6, 6.7, 8.1, 8.2, 8.4, 9.3, 9.4, 12.3, 12.4, 15.1, 15.2
 */

/** Helper to create a minimal IndexedMessage for testing. */
function makeMessage(overrides: Partial<IndexedMessage> = {}): IndexedMessage {
  return {
    uid: 'test-uid-1',
    nativeId: null,
    role: 'user',
    text: 'Hello world',
    preview: 'Hello world',
    ordinal: 1,
    status: 'complete',
    pinned: false,
    ...overrides,
  };
}

/** Queries inside the sidebar's shadow root. */
function shadowQuery(controller: SidebarController, selector: string): Element | null {
  const host = document.getElementById('messagerail-host');
  return host?.shadowRoot?.querySelector(selector) ?? null;
}

function shadowQueryAll(controller: SidebarController, selector: string): NodeListOf<Element> {
  const host = document.getElementById('messagerail-host');
  return host?.shadowRoot?.querySelectorAll(selector) ?? document.querySelectorAll('.nonexistent');
}

describe('SidebarController', () => {
  let controller: SidebarController;

  afterEach(() => {
    controller?.unmount();
  });

  // ── 1. Mount and structure ──────────────────────────────────────────

  describe('mount and structure', () => {
    it('creates a shadow root with an aside element with correct aria-label', () => {
      controller = new SidebarController();
      controller.mount(document);

      const aside = shadowQuery(controller, 'aside');
      expect(aside).not.toBeNull();
      expect(aside!.getAttribute('aria-label')).toBe('MessageRail message index');
    });

    it('contains a search input and message list container', () => {
      controller = new SidebarController();
      controller.mount(document);

      const searchInput = shadowQuery(controller, '.mr-search-input');
      expect(searchInput).not.toBeNull();

      const listContainer = shadowQuery(controller, '.mr-message-list-container');
      expect(listContainer).not.toBeNull();
    });

    it('replaces an existing MessageRail host before mounting', () => {
      const staleHost = document.createElement('div');
      staleHost.id = 'messagerail-host';
      document.body.appendChild(staleHost);

      controller = new SidebarController();
      controller.mount(document);

      const hosts = document.querySelectorAll('#messagerail-host');
      expect(hosts.length).toBe(1);
      expect(hosts[0]).not.toBe(staleHost);
      expect(hosts[0].shadowRoot).not.toBeNull();
    });
  });

  // ── 2. Toggle collapse/expand ───────────────────────────────────────

  describe('toggle collapse/expand', () => {
    it('toggle() adds mr-collapsed class', () => {
      controller = new SidebarController();
      controller.mount(document);

      controller.toggle();

      const aside = shadowQuery(controller, 'aside');
      expect(aside!.classList.contains('mr-collapsed')).toBe(true);
    });

    it('toggle() again removes mr-collapsed class', () => {
      controller = new SidebarController();
      controller.mount(document);

      controller.toggle();
      controller.toggle();

      const aside = shadowQuery(controller, 'aside');
      expect(aside!.classList.contains('mr-collapsed')).toBe(false);
    });

    it('isCollapsed() returns correct state', () => {
      controller = new SidebarController();
      controller.mount(document);

      expect(controller.isCollapsed()).toBe(false);
      controller.toggle();
      expect(controller.isCollapsed()).toBe(true);
      controller.toggle();
      expect(controller.isCollapsed()).toBe(false);
    });
  });

  // ── 3. Accessibility ───────────────────────────────────────────────

  describe('accessibility', () => {
    it('root element is aside with correct aria-label', () => {
      controller = new SidebarController();
      controller.mount(document);

      const aside = shadowQuery(controller, 'aside');
      expect(aside).not.toBeNull();
      expect(aside!.tagName.toLowerCase()).toBe('aside');
      expect(aside!.getAttribute('aria-label')).toBe('MessageRail message index');
    });

    it('pin buttons are not rendered (pin disabled)', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage({ pinned: false })]);

      const pinBtns = shadowQueryAll(controller, '.mr-action-btn');
      expect(pinBtns.length).toBe(0);
    });

    it('pin buttons are not rendered for pinned messages (pin disabled)', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage({ pinned: true })]);

      const pinBtns = shadowQueryAll(controller, '.mr-action-btn');
      expect(pinBtns.length).toBe(0);
    });

    it('message items are keyboard-focusable for jump navigation', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage()]);

      const item = shadowQuery(controller, '.mr-message-item');
      expect(item).not.toBeNull();
      expect(item!.getAttribute('role')).toBe('button');
      expect(item!.getAttribute('tabindex')).toBe('0');
    });

    it('search input has an associated label', () => {
      controller = new SidebarController();
      controller.mount(document);

      const label = shadowQuery(controller, 'label[for="mr-search-input"]');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe('Search messages');

      const input = shadowQuery(controller, '#mr-search-input');
      expect(input).not.toBeNull();
    });

    it('all action buttons are <button> elements (inherently keyboard-focusable)', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage(), makeMessage({ uid: 'test-uid-2', ordinal: 2 })]);

      const buttons = shadowQueryAll(controller, 'button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((btn) => {
        expect(btn.tagName.toLowerCase()).toBe('button');
      });
    });
  });

  // ── 4. Streaming indicator ─────────────────────────────────────────

  describe('streaming indicator', () => {
    it('messages with status streaming show .mr-streaming-indicator', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage({ status: 'streaming' })]);

      const indicator = shadowQuery(controller, '.mr-streaming-indicator');
      expect(indicator).not.toBeNull();
    });

    it('messages with status complete do NOT show .mr-streaming-indicator', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage({ status: 'complete' })]);

      const indicator = shadowQuery(controller, '.mr-streaming-indicator');
      expect(indicator).toBeNull();
    });

    it('streaming indicator is removed when status changes to complete', () => {
      controller = new SidebarController();
      controller.mount(document);

      // First render: streaming
      controller.render([makeMessage({ status: 'streaming' })]);
      expect(shadowQuery(controller, '.mr-streaming-indicator')).not.toBeNull();

      // Re-render: complete
      controller.render([makeMessage({ status: 'complete' })]);
      expect(shadowQuery(controller, '.mr-streaming-indicator')).toBeNull();
    });
  });

  // ── 5. Search input ────────────────────────────────────────────────

  describe('search input', () => {
    it('search input exists and has accessible label', () => {
      controller = new SidebarController();
      controller.mount(document);

      const input = shadowQuery(controller, '.mr-search-input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.id).toBe('mr-search-input');

      const label = shadowQuery(controller, 'label[for="mr-search-input"]');
      expect(label).not.toBeNull();
    });

    it('onSearch callback fires when input value changes', () => {
      const onSearch = vi.fn();
      controller = new SidebarController({ onSearch });
      controller.mount(document);

      const input = shadowQuery(controller, '.mr-search-input') as HTMLInputElement;
      input.value = 'test query';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(onSearch).toHaveBeenCalledWith('test query');
    });
  });

  // ── 6. Pinned messages (disabled) ──────────────────────────────────

  describe('pinned messages', () => {
    it('pinned section is NOT rendered (pin disabled)', () => {
      controller = new SidebarController();
      controller.mount(document);

      const messages = [
        makeMessage({ uid: 'uid-1', ordinal: 1, pinned: true, preview: 'Pinned msg' }),
        makeMessage({ uid: 'uid-2', ordinal: 2, pinned: false, preview: 'Regular msg' }),
      ];
      controller.render(messages);

      const pinnedSection = shadowQuery(controller, '.mr-pinned-section');
      expect(pinnedSection).toBeNull();
    });

    it('pin markers are NOT rendered (pin disabled)', () => {
      controller = new SidebarController();
      controller.mount(document);

      controller.render([makeMessage({ pinned: true })]);

      const pinMarker = shadowQuery(controller, '.mr-pin-marker');
      expect(pinMarker).toBeNull();
    });

    it('unpinned messages do NOT show a pin marker', () => {
      controller = new SidebarController();
      controller.mount(document);

      controller.render([makeMessage({ pinned: false })]);

      const pinMarker = shadowQuery(controller, '.mr-pin-marker');
      expect(pinMarker).toBeNull();
    });

    it('does not render pinned section when no messages are pinned', () => {
      controller = new SidebarController();
      controller.mount(document);

      controller.render([makeMessage({ pinned: false })]);

      const pinnedSection = shadowQuery(controller, '.mr-pinned-section');
      expect(pinnedSection).toBeNull();
    });
  });

  // ── 7. Message list ────────────────────────────────────────────────

  describe('message list', () => {
    it('uses <ol> elements for semantic list markup', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([makeMessage()]);

      const ol = shadowQuery(controller, 'ol.mr-message-list');
      expect(ol).not.toBeNull();
      expect(ol!.tagName.toLowerCase()).toBe('ol');
    });

    it('each item has a turn-number badge, preview, and no pin action buttons', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([
        makeMessage({ ordinal: 3, role: 'user', preview: 'Test preview text' }),
      ]);

      const item = shadowQuery(controller, '.mr-message-item');
      expect(item).not.toBeNull();

      // Turn-number badge is present and starts from the visible sidebar rows
      const turnNumber = item!.querySelector('.mr-turn-number');
      expect(turnNumber).not.toBeNull();
      expect(turnNumber!.textContent).toBe('#1');

      // No role label rendered
      const role = item!.querySelector('.mr-role');
      expect(role).toBeNull();

      // Preview is present
      const preview = item!.querySelector('.mr-preview');
      expect(preview).not.toBeNull();
      expect(preview!.textContent).toBe('Test preview text');

      // Icon buttons are not present (pin is disabled)
      const iconBtns = item!.querySelectorAll('.mr-icon-btn');
      expect(iconBtns.length).toBe(0);
    });

    it('does not render assistant messages in the list', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([
        makeMessage({ uid: 'user-1', ordinal: 1, role: 'user', preview: 'User msg' }),
        makeMessage({ uid: 'asst-1', ordinal: 2, role: 'assistant', preview: 'Assistant msg' }),
        makeMessage({ uid: 'user-2', ordinal: 3, role: 'user', preview: 'Another user msg' }),
      ]);

      const items = shadowQueryAll(controller, '.mr-message-list .mr-message-item');
      expect(items.length).toBe(2);

      // Verify only user messages are rendered
      const previews = Array.from(items).map(
        (li) => li.querySelector('.mr-preview')!.textContent,
      );
      expect(previews).toEqual(['User msg', 'Another user msg']);
    });

    it('numbers visible user turns sequentially even when assistant messages are indexed', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([
        makeMessage({ uid: 'user-1', ordinal: 1, role: 'user', preview: 'First user' }),
        makeMessage({ uid: 'asst-1', ordinal: 2, role: 'assistant', preview: 'Assistant reply' }),
        makeMessage({ uid: 'user-2', ordinal: 3, role: 'user', preview: 'Second user' }),
        makeMessage({ uid: 'user-3', ordinal: 7, role: 'user', preview: 'Third user' }),
      ]);

      const badges = Array.from(shadowQueryAll(controller, '.mr-turn-number')).map(
        (badge) => badge.textContent,
      );
      expect(badges).toEqual(['#1', '#2', '#3']);
    });

    it('can preserve stable turn numbers supplied by the caller', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render(
        [makeMessage({ uid: 'user-5', ordinal: 9, role: 'user', preview: 'Filtered user' })],
        { turnNumberByUid: new Map([['user-5', 5]]) },
      );

      const badge = shadowQuery(controller, '.mr-turn-number');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('#5');
    });

    it('shows empty state when no messages are provided', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([]);

      const emptyState = shadowQuery(controller, '.mr-empty-state');
      expect(emptyState).not.toBeNull();
      expect(emptyState!.textContent).toContain('No messages indexed yet');
    });

    it('shows no-results empty state for empty search results', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([], { emptyState: 'no-results', searchQuery: 'needle' });

      const emptyState = shadowQuery(controller, '.mr-empty-state');
      expect(emptyState).not.toBeNull();
      expect(emptyState!.textContent).toContain('No matching messages');
      expect(emptyState!.textContent).toContain('No matches for "needle".');
    });

    it('shows healthcheck failure empty state when requested', () => {
      controller = new SidebarController();
      controller.mount(document);
      controller.render([], { emptyState: 'healthcheck-failed' });

      const emptyState = shadowQuery(controller, '.mr-empty-state');
      expect(emptyState).not.toBeNull();
      expect(emptyState!.textContent).toContain('MessageRail needs a reload');
      expect(emptyState!.textContent).toContain('Page structure changed.');
    });
  });

  // ── 8. Callbacks ───────────────────────────────────────────────────

  describe('callbacks', () => {
    it('onJump fires when message item is clicked', () => {
      const onJump = vi.fn();
      controller = new SidebarController({ onJump });
      controller.mount(document);
      controller.render([makeMessage({ uid: 'jump-uid' })]);

      const item = shadowQuery(controller, '.mr-message-list .mr-message-item') as HTMLElement;
      item.click();

      expect(onJump).toHaveBeenCalledWith('jump-uid');
    });

    it('onJump does NOT fire when pin button is clicked (pin disabled — button absent)', () => {
      const onJump = vi.fn();
      const onTogglePin = vi.fn();
      controller = new SidebarController({ onJump, onTogglePin });
      controller.mount(document);
      controller.render([makeMessage({ uid: 'pin-uid' })]);

      // Pin button should not exist since pin is disabled
      const pinBtn = shadowQuery(controller, '.mr-message-list .mr-action-btn');
      expect(pinBtn).toBeNull();
    });

    it('onTogglePin does not fire (pin disabled — button absent)', () => {
      const onTogglePin = vi.fn();
      controller = new SidebarController({ onTogglePin });
      controller.mount(document);
      controller.render([makeMessage({ uid: 'pin-uid' })]);

      // Pin button should not exist since pin is disabled
      const pinBtn = shadowQuery(controller, '.mr-message-list .mr-action-btn');
      expect(pinBtn).toBeNull();
      expect(onTogglePin).not.toHaveBeenCalled();
    });
  });

  // ── 9. Unmount ─────────────────────────────────────────────────────

  describe('unmount', () => {
    it('removes the host element from the document', () => {
      controller = new SidebarController();
      controller.mount(document);

      expect(document.getElementById('messagerail-host')).not.toBeNull();

      controller.unmount();

      expect(document.getElementById('messagerail-host')).toBeNull();
    });
  });
});
