/**
 * SidebarController — manages the Shadow DOM sidebar UI for MessageRail.
 *
 * Injects a collapsible sidebar into the host page via Shadow DOM,
 * renders the message index with ordinals, role labels, previews,
 * pin markers, streaming indicators, and action buttons.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.1, 9.3, 9.4,
 *              12.1, 12.2, 12.3, 12.4, 12.5, 15.1, 15.2
 */

import type { IndexedMessage } from '../types';

/** Callback signatures for sidebar interactions. */
export interface SidebarCallbacks {
  onJump?: (uid: string) => void;
  onTogglePin?: (uid: string) => void;
  onSearch?: (query: string) => void;
  onToggle?: () => void;
}

/**
 * CSS styles for the sidebar, rendered entirely within the Shadow DOM.
 * Uses CSS custom properties and prefers-color-scheme for light/dark support.
 * System font stack only — no external fonts or stylesheets.
 *
 * Requirements: 6.2, 6.5, 12.1, 12.2, 12.5
 */
const SIDEBAR_STYLES = `
  :host {
    --mr-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --mr-bg: #ffffff;
    --mr-bg-secondary: #f7f7f8;
    --mr-bg-hover: #eff1f5;
    --mr-bg-active: #e8eaef;
    --mr-text: #1a1a1a;
    --mr-text-secondary: #6b7280;
    --mr-text-tertiary: #9ca3af;
    --mr-border: #e5e7eb;
    --mr-accent: #3b82f6;
    --mr-accent-hover: #2563eb;
    --mr-pin-color: #f59e0b;
    --mr-streaming-color: #10b981;
    --mr-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
    --mr-radius: 8px;
    --mr-radius-sm: 6px;

    all: initial;
    display: block;
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    z-index: 2147483647;
    font-family: var(--mr-font-family);
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --mr-bg: #1a1b1e;
      --mr-bg-secondary: #25262b;
      --mr-bg-hover: #2c2d33;
      --mr-bg-active: #35363d;
      --mr-text: #e4e5e7;
      --mr-text-secondary: #9ca3af;
      --mr-text-tertiary: #6b7280;
      --mr-border: #2e3035;
      --mr-accent: #60a5fa;
      --mr-accent-hover: #3b82f6;
      --mr-pin-color: #fbbf24;
      --mr-streaming-color: #34d399;
      --mr-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
    }
  }

  .mr-sidebar {
    display: flex;
    flex-direction: column;
    width: 300px;
    height: 100%;
    background: var(--mr-bg);
    color: var(--mr-text);
    border-left: 1px solid var(--mr-border);
    box-shadow: var(--mr-shadow);
    font-family: var(--mr-font-family);
    font-size: 13px;
    line-height: 1.5;
    box-sizing: border-box;
    transition: width 0.2s ease;
    overflow: hidden;
  }

  .mr-sidebar.mr-collapsed {
    width: 36px;
  }

  /* ── Header ─────────────────────────────── */

  .mr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--mr-border);
    flex-shrink: 0;
    background: var(--mr-bg);
  }

  .mr-header-title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: -0.01em;
    color: var(--mr-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mr-collapsed .mr-header-title,
  .mr-collapsed .mr-search-container,
  .mr-collapsed .mr-message-list-container {
    display: none;
  }

  .mr-toggle-btn {
    background: none;
    border: none;
    color: var(--mr-text-secondary);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--mr-radius-sm);
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }

  .mr-toggle-btn:hover {
    background: var(--mr-bg-hover);
    color: var(--mr-text);
  }

  .mr-toggle-btn:focus-visible {
    outline: 2px solid var(--mr-accent);
    outline-offset: 1px;
  }

  /* ── Search ─────────────────────────────── */

  .mr-search-container {
    padding: 6px 10px;
    border-bottom: 1px solid var(--mr-border);
    flex-shrink: 0;
    position: relative;
  }

  .mr-search-icon {
    position: absolute;
    left: 18px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--mr-text-tertiary);
    font-size: 13px;
    pointer-events: none;
  }

  .mr-search-input {
    width: 100%;
    padding: 6px 8px 6px 28px;
    border: 1px solid var(--mr-border);
    border-radius: var(--mr-radius);
    background: var(--mr-bg-secondary);
    color: var(--mr-text);
    font-family: var(--mr-font-family);
    font-size: 12px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .mr-search-input::placeholder {
    color: var(--mr-text-tertiary);
  }

  .mr-search-input:focus {
    outline: none;
    border-color: var(--mr-accent);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  /* ── Message list ───────────────────────── */

  .mr-message-list-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .mr-message-list-container::-webkit-scrollbar {
    width: 4px;
  }

  .mr-message-list-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .mr-message-list-container::-webkit-scrollbar-thumb {
    background: var(--mr-border);
    border-radius: 2px;
  }

  .mr-pinned-section {
    border-bottom: 1px solid var(--mr-border);
  }

  .mr-pinned-header {
    padding: 6px 10px 2px;
    font-size: 10px;
    font-weight: 600;
    color: var(--mr-pin-color);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mr-message-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* ── Message item ───────────────────────── */

  .mr-message-item {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    gap: 2px;
    cursor: pointer;
    border-bottom: 1px solid var(--mr-border);
    transition: background 0.12s;
    position: relative;
  }

  .mr-message-item:hover {
    background: var(--mr-bg-hover);
  }

  .mr-message-item:active {
    background: var(--mr-bg-active);
  }

  .mr-message-item:focus-visible {
    outline: 2px solid var(--mr-accent);
    outline-offset: -2px;
    border-radius: 2px;
  }

  .mr-message-top-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 20px;
  }

  .mr-pin-marker {
    font-size: 11px;
    flex-shrink: 0;
  }

  .mr-streaming-indicator {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 500;
    color: var(--mr-streaming-color);
  }

  .mr-streaming-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--mr-streaming-color);
    animation: mr-pulse 1.4s ease-in-out infinite;
  }

  @keyframes mr-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  .mr-spacer {
    flex: 1;
  }

  /* ── Pin button (show on hover) ─────────── */

  .mr-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .mr-message-item:hover .mr-actions,
  .mr-message-item:focus-within .mr-actions {
    opacity: 1;
  }

  .mr-actions.mr-pinned-visible {
    opacity: 1;
  }

  .mr-action-btn {
    background: none;
    border: none;
    color: var(--mr-text-tertiary);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--mr-radius-sm);
    font-size: 11px;
    line-height: 1;
    font-family: var(--mr-font-family);
    transition: background 0.12s, color 0.12s;
  }

  .mr-action-btn:hover {
    background: var(--mr-bg-active);
    color: var(--mr-text);
  }

  .mr-action-btn:focus-visible {
    outline: 2px solid var(--mr-accent);
    outline-offset: 1px;
  }

  .mr-icon-btn {
    font-size: 13px;
    padding: 2px 4px;
  }

  /* ── Preview text ───────────────────────── */

  .mr-preview {
    font-size: 13px;
    color: var(--mr-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }

  .mr-assistant-preview {
    font-size: 11px;
    color: var(--mr-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 8px;
    border-left: 2px solid var(--mr-border);
    line-height: 1.4;
    margin-top: 1px;
  }

  .mr-empty-state {
    padding: 32px 16px;
    text-align: center;
    color: var(--mr-text-tertiary);
    font-size: 12px;
  }
`;

/**
 * SidebarController manages the Shadow DOM host element, renders the
 * message list, search UI, and handles user interactions.
 *
 * Requirements: 6.1, 6.2, 6.5, 12.1, 12.2, 12.5
 */
export class SidebarController {
  private hostElement: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private sidebarEl: HTMLElement | null = null;
  private messageListContainer: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private collapsed: boolean = false;
  private callbacks: SidebarCallbacks = {};

  constructor(callbacks?: SidebarCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  /** Sets callback functions for sidebar interactions. */
  setCallbacks(callbacks: Partial<SidebarCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Creates the Shadow DOM host and injects sidebar markup.
   *
   * Requirements: 6.1, 6.2, 6.5, 12.1, 12.2, 12.5
   */
  mount(doc: Document): void {
    // Create host element
    this.hostElement = doc.createElement('div');
    this.hostElement.id = 'messagerail-host';
    doc.body.appendChild(this.hostElement);

    // Attach shadow root
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    // Inject styles
    const styleEl = doc.createElement('style');
    styleEl.textContent = SIDEBAR_STYLES;
    this.shadowRoot.appendChild(styleEl);

    // Create root aside landmark
    this.sidebarEl = doc.createElement('aside');
    this.sidebarEl.setAttribute('aria-label', 'MessageRail message index');
    this.sidebarEl.className = 'mr-sidebar';
    this.shadowRoot.appendChild(this.sidebarEl);

    // Header
    const header = doc.createElement('div');
    header.className = 'mr-header';

    const title = doc.createElement('span');
    title.className = 'mr-header-title';
    title.textContent = 'MessageRail';
    header.appendChild(title);

    const toggleBtn = doc.createElement('button');
    toggleBtn.className = 'mr-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle sidebar');
    toggleBtn.textContent = '⏵';
    toggleBtn.addEventListener('click', () => {
      this.toggle();
      this.callbacks.onToggle?.();
    });
    header.appendChild(toggleBtn);

    this.sidebarEl.appendChild(header);

    // Search container
    const searchContainer = doc.createElement('div');
    searchContainer.className = 'mr-search-container';

    const searchIcon = doc.createElement('span');
    searchIcon.className = 'mr-search-icon';
    searchIcon.textContent = '🔍';

    const searchLabel = doc.createElement('label');
    searchLabel.className = 'mr-search-label';
    searchLabel.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
    searchLabel.textContent = 'Search messages';

    this.searchInput = doc.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'mr-search-input';
    this.searchInput.placeholder = 'Search messages…';

    // Associate label with input
    const searchId = 'mr-search-input';
    this.searchInput.id = searchId;
    searchLabel.setAttribute('for', searchId);

    this.searchInput.addEventListener('input', () => {
      this.callbacks.onSearch?.(this.searchInput!.value);
    });

    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchLabel);
    searchContainer.appendChild(this.searchInput);
    this.sidebarEl.appendChild(searchContainer);

    // Message list container
    this.messageListContainer = doc.createElement('div');
    this.messageListContainer.className = 'mr-message-list-container';
    this.sidebarEl.appendChild(this.messageListContainer);
  }

  /**
   * Re-renders the message list from the provided messages.
   *
   * Displays pinned messages in a separate section at the top,
   * then all messages below. Each item includes ordinal, role label,
   * preview, pin marker, streaming indicator, and action buttons.
   *
   * Requirements: 6.3, 6.4, 6.6, 6.7, 9.1, 9.3, 9.4, 12.3, 12.4, 15.1, 15.2
   */
  render(messages: IndexedMessage[]): void {
    if (!this.messageListContainer || !this.shadowRoot) {
      return;
    }

    // Clear existing content
    this.messageListContainer.innerHTML = '';

    const doc = this.shadowRoot.ownerDocument ?? document;

    // Build a map from each user message to the next assistant response
    const assistantResponseMap = new Map<string, IndexedMessage>();
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        // Find the next assistant message after this user message
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'assistant') {
            assistantResponseMap.set(messages[i].uid, messages[j]);
            break;
          }
          if (messages[j].role === 'user') break; // next user message, no assistant in between
        }
      }
    }

    // Show only user messages in the sidebar
    const userMessages = messages.filter((m) => m.role === 'user');

    // Separate pinned messages
    const pinnedMessages = userMessages.filter((m) => m.pinned);

    // Render pinned section if there are pinned messages
    if (pinnedMessages.length > 0) {
      const pinnedSection = doc.createElement('div');
      pinnedSection.className = 'mr-pinned-section';

      const pinnedHeader = doc.createElement('div');
      pinnedHeader.className = 'mr-pinned-header';
      pinnedHeader.textContent = 'Pinned';
      pinnedSection.appendChild(pinnedHeader);

      const pinnedList = doc.createElement('ol');
      pinnedList.className = 'mr-message-list';
      pinnedList.setAttribute('aria-label', 'Pinned messages');

      for (const msg of pinnedMessages) {
        pinnedList.appendChild(this.createMessageItem(doc, msg, assistantResponseMap.get(msg.uid)));
      }

      pinnedSection.appendChild(pinnedList);
      this.messageListContainer.appendChild(pinnedSection);
    }

    // Render user messages
    if (userMessages.length === 0) {
      const emptyState = doc.createElement('div');
      emptyState.className = 'mr-empty-state';
      emptyState.textContent = 'No messages indexed yet.';
      this.messageListContainer.appendChild(emptyState);
      return;
    }

    const messageList = doc.createElement('ol');
    messageList.className = 'mr-message-list';
    messageList.setAttribute('aria-label', 'Message list');

    for (const msg of userMessages) {
      messageList.appendChild(this.createMessageItem(doc, msg, assistantResponseMap.get(msg.uid)));
    }

    this.messageListContainer.appendChild(messageList);
  }

  /**
   * Creates a single message list item element.
   */
  private createMessageItem(doc: Document, msg: IndexedMessage, assistantResponse?: IndexedMessage): HTMLLIElement {
    const li = doc.createElement('li');
    li.className = 'mr-message-item';
    li.dataset.uid = msg.uid;
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Jump to message: ${msg.preview}`);

    // Click anywhere on the item to jump
    li.addEventListener('click', (e) => {
      // Don't jump if the user clicked the pin button
      if ((e.target as Element).closest('.mr-action-btn')) return;
      this.callbacks.onJump?.(msg.uid);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if ((e.target as Element).closest('.mr-action-btn')) return;
        e.preventDefault();
        this.callbacks.onJump?.(msg.uid);
      }
    });

    // Top row: pin marker, streaming indicator, spacer, pin button
    const topRow = doc.createElement('div');
    topRow.className = 'mr-message-top-row';

    // Pin marker (visible only when pinned)
    if (msg.pinned) {
      const pinMarker = doc.createElement('span');
      pinMarker.className = 'mr-pin-marker';
      pinMarker.textContent = '📌';
      pinMarker.setAttribute('aria-label', 'Pinned');
      topRow.appendChild(pinMarker);
    }

    // Streaming indicator
    if (msg.status === 'streaming') {
      const streamingIndicator = doc.createElement('span');
      streamingIndicator.className = 'mr-streaming-indicator';

      const dot = doc.createElement('span');
      dot.className = 'mr-streaming-dot';
      streamingIndicator.appendChild(dot);

      const streamingText = doc.createElement('span');
      streamingText.textContent = 'Streaming';
      streamingIndicator.appendChild(streamingText);

      topRow.appendChild(streamingIndicator);
    }

    // Spacer
    const spacer = doc.createElement('span');
    spacer.className = 'mr-spacer';
    topRow.appendChild(spacer);

    // Pin toggle button (icon)
    const actions = doc.createElement('span');
    actions.className = msg.pinned ? 'mr-actions mr-pinned-visible' : 'mr-actions';

    const pinBtn = doc.createElement('button');
    pinBtn.className = 'mr-action-btn mr-icon-btn';
    pinBtn.setAttribute(
      'aria-label',
      msg.pinned ? 'Unpin message' : 'Pin message'
    );
    pinBtn.textContent = msg.pinned ? '📌' : '📍';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onTogglePin?.(msg.uid);
    });
    actions.appendChild(pinBtn);

    topRow.appendChild(actions);
    li.appendChild(topRow);

    // Preview text
    const preview = doc.createElement('div');
    preview.className = 'mr-preview';
    preview.textContent = msg.preview;
    li.appendChild(preview);

    // Assistant response preview (one line)
    if (assistantResponse) {
      const assistantLine = doc.createElement('div');
      assistantLine.className = 'mr-assistant-preview';
      assistantLine.textContent = assistantResponse.preview;
      li.appendChild(assistantLine);
    }

    return li;
  }

  /**
   * Toggles between expanded and collapsed states.
   *
   * Requirements: 6.6, 6.7
   */
  toggle(): void {
    if (!this.sidebarEl) {
      return;
    }
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.sidebarEl.classList.add('mr-collapsed');
    } else {
      this.sidebarEl.classList.remove('mr-collapsed');
    }
  }

  /**
   * Expands the sidebar if collapsed and moves focus to the search input.
   */
  focusSearch(): void {
    if (this.collapsed) {
      this.toggle();
    }
    this.searchInput?.focus();
  }

  /**
   * Returns whether the sidebar is currently collapsed.
   */
  isCollapsed(): boolean {
    return this.collapsed;
  }

  /**
   * Removes the host element from the document, cleaning up the sidebar.
   */
  unmount(): void {
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this.shadowRoot = null;
    this.sidebarEl = null;
    this.messageListContainer = null;
    this.searchInput = null;
  }
}
