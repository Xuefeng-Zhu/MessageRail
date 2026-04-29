/**
 * MessageRail — Content Script Orchestrator
 *
 * Main entry point injected into supported AI chat pages. Wires together
 * the adapter registry, message index, sidebar controller, and live
 * navigation. Handles SPA navigation, healthcheck monitoring, and
 * extension disconnection gracefully.
 *
 * Requirements: 4.1, 6.1, 7.1, 8.3, 9.2, 9.6, 13.4, 13.5
 */

import type { SiteAdapter, ObservedMessage, IndexedMessage } from './types';
import { AdapterRegistry } from './adapters/registry';
import { ChatGPTAdapter } from './adapters/chatgpt';
import { ClaudeAdapter } from './adapters/claude';
import { GeminiAdapter } from './adapters/gemini';
import { GrokAdapter } from './adapters/grok';
import { PerplexityAdapter } from './adapters/perplexity';
import { MessageIndex } from './core/message-index';
import { SidebarController, type SidebarEmptyState } from './ui/sidebar-controller';
import { filterMessagesForSidebarSearch } from './ui/sidebar-search';
import { PreferencesStore } from './storage/preferences-store';

// ── Constants ──────────────────────────────────────────────────────

/** Maximum number of polling attempts to find the chat container. */
const POLL_MAX_ATTEMPTS = 10;

/** Interval in milliseconds between polling attempts. */
const POLL_INTERVAL_MS = 500;

/** Interval in milliseconds for healthcheck monitoring. */
const HEALTHCHECK_INTERVAL_MS = 5000;

// ── Module-level state ─────────────────────────────────────────────

/** Cleanup function for the current MutationObserver. */
let observerCleanup: (() => void) | null = null;

/** Healthcheck interval timer ID. */
let healthcheckTimer: ReturnType<typeof setInterval> | null = null;

/** Reference to the current sidebar controller. */
let sidebar: SidebarController | null = null;

/** Reference to the current message index. */
let messageIndex: MessageIndex | null = null;

/** Reference to the current adapter. */
let currentAdapter: SiteAdapter | null = null;

/** Monotonic token used to ignore stale async initialization work. */
let initializationToken: number = 0;

/** Tracks the last known URL for SPA navigation detection. */
let lastUrl: string = '';

/** Preferences store instance. */
const preferencesStore = new PreferencesStore();

/** Current sidebar search query, preserved across live updates. */
let currentSearchQuery: string = '';

// ── Adapter Registry Setup ─────────────────────────────────────────

/**
 * Creates and populates the adapter registry with all known adapters.
 */
function createRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new ChatGPTAdapter());
  registry.register(new ClaudeAdapter());
  registry.register(new GeminiAdapter());
  registry.register(new GrokAdapter());
  registry.register(new PerplexityAdapter());
  return registry;
}

// ── Polling ────────────────────────────────────────────────────────

/**
 * Polls for the chat container element by attempting adapter detection.
 * Returns the matched adapter once found, or null after max attempts.
 */
function pollForAdapter(
  registry: AdapterRegistry,
  attempt: number = 0,
): Promise<SiteAdapter | null> {
  return new Promise((resolve) => {
    const adapter = registry.getAdapter(new URL(document.URL), document);
    if (adapter) {
      // Verify the adapter can actually extract context (DOM is ready)
      const context = adapter.getChatContext(document);
      if (context) {
        resolve(adapter);
        return;
      }
    }

    if (attempt >= POLL_MAX_ATTEMPTS - 1) {
      // If we found an adapter but no context, still return the adapter
      // so the sidebar can show an empty state
      if (adapter) {
        resolve(adapter);
      } else {
        resolve(null);
      }
      return;
    }

    setTimeout(() => {
      pollForAdapter(registry, attempt + 1).then(resolve);
    }, POLL_INTERVAL_MS);
  });
}

// ── Teardown ───────────────────────────────────────────────────────

/**
 * Tears down the current session: disconnects observer, stops
 * healthcheck, and unmounts the sidebar.
 */
function teardown(): void {
  initializationToken++;

  if (observerCleanup) {
    observerCleanup();
    observerCleanup = null;
  }

  if (healthcheckTimer !== null) {
    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
  }

  if (sidebar) {
    sidebar.unmount();
    sidebar = null;
  }

  messageIndex = null;
  currentAdapter = null;
  currentSearchQuery = '';
}

// ── Initialization ─────────────────────────────────────────────────

/**
 * Main initialization routine. Polls for an adapter, sets up the
 * message index, mounts the sidebar, and wires all interactions.
 */
async function initialize(): Promise<void> {
  const token = ++initializationToken;
  const registry = createRegistry();

  const adapter = await pollForAdapter(registry);
  if (token !== initializationToken) {
    return;
  }

  if (!adapter) {
    console.debug('[MessageRail] No matching adapter found for this page. Exiting gracefully.');
    return;
  }

  // Extract chat context
  const chatContext = adapter.getChatContext(document);

  // Create message index
  const nextMessageIndex = new MessageIndex();
  if (chatContext) {
    nextMessageIndex.setChatContext(chatContext.provider, chatContext.chatId);
    // Pin loading disabled for now
    // await nextMessageIndex.loadPins(chatContext.chatId);
  }

  // Scan visible messages
  try {
    const visibleMessages = adapter.scanVisible(document);
    nextMessageIndex.update(visibleMessages);
  } catch (err) {
    console.error('[MessageRail] Error scanning visible messages:', err);
  }

  // Load sidebar collapsed preference
  const collapsed = await preferencesStore.get<boolean>('sidebarCollapsed');
  if (token !== initializationToken) {
    return;
  }

  currentAdapter = adapter;
  messageIndex = nextMessageIndex;
  currentSearchQuery = '';

  // Create sidebar with callbacks (pin disabled for now)
  sidebar = new SidebarController({
    onJump: handleJump,
    // onTogglePin: handleTogglePin,
    onSearch: handleSearch,
    onToggle: handleToggle,
  });

  // Mount and render
  sidebar.mount(document);

  // Restore collapsed state if previously collapsed
  if (collapsed === true) {
    sidebar.toggle();
  }

  renderSidebarMessages('waiting');

  // Attach live observer
  try {
    observerCleanup = adapter.observe(document, handleObserverUpdate);
  } catch (err) {
    console.error('[MessageRail] Error attaching observer:', err);
  }

  // Start healthcheck monitoring
  startHealthcheck(adapter);

  // Track current URL for SPA navigation
  lastUrl = document.URL;
}

// ── Sidebar Callbacks ──────────────────────────────────────────────

/**
 * Handles jump-to-message: materializes the message's LiveAnchor
 * and scrolls it into view with accessibility focus.
 */
function handleJump(uid: string): void {
  if (!messageIndex || !currentAdapter) return;

  const allMessages = messageIndex.getAll();
  const indexed = allMessages.find((m: IndexedMessage) => m.uid === uid);
  if (!indexed) return;

  // We need the original ObservedMessage with its element reference
  // to materialize. Re-scan to get current DOM references.
  const observed = currentAdapter.scanVisible(document);
  const match =
    observed.find((m: ObservedMessage) => m.uid === indexed.uid) ??
    observed[indexed.ordinal - 1] ??
    null;

  if (!match) return;

  const anchor = currentAdapter.materializeMessage(match, document);
  if (anchor) {
    anchor.scrollIntoView();
    anchor.focusForA11y();
  }
}

/**
 * Handles pin toggle: toggles the pin state in the message index
 * and re-renders the sidebar.
 */
async function handleTogglePin(uid: string): Promise<void> {
  if (!messageIndex || !sidebar) return;

  await messageIndex.togglePin(uid);
  renderSidebarMessages();
}

/**
 * Handles search: filters messages by query and re-renders.
 * Empty query restores the full list.
 */
function handleSearch(query: string): void {
  if (!messageIndex || !sidebar) return;

  currentSearchQuery = query;
  renderSidebarMessages();
}

/**
 * Handles sidebar toggle: persists the collapsed state.
 */
async function handleToggle(): Promise<void> {
  if (!sidebar) return;
  await preferencesStore.set('sidebarCollapsed', sidebar.isCollapsed());
}

// ── Live Observer Updates ──────────────────────────────────────────

/**
 * Handles MutationObserver updates: pipes new messages through
 * the message index and re-renders the sidebar.
 */
function handleObserverUpdate(messages: ObservedMessage[]): void {
  if (!messageIndex || !sidebar) return;

  try {
    messageIndex.update(messages);
    renderSidebarMessages();
  } catch (err) {
    console.error('[MessageRail] Error processing observer update:', err);
  }
}

// ── Healthcheck ────────────────────────────────────────────────────

/**
 * Starts periodic healthcheck monitoring. If the adapter's expected
 * DOM structure disappears, disables the observer and shows a banner.
 */
function startHealthcheck(adapter: SiteAdapter): void {
  if (healthcheckTimer !== null) {
    clearInterval(healthcheckTimer);
  }

  healthcheckTimer = setInterval(() => {
    const healthy = adapter.healthcheck(document);
    if (!healthy) {
      // Disable observer
      if (observerCleanup) {
        observerCleanup();
        observerCleanup = null;
      }

      // Show banner in sidebar
      if (sidebar) {
        const bannerMessages: IndexedMessage[] = [];
        sidebar.render(bannerMessages, { emptyState: 'healthcheck-failed' });
        console.warn(
          '[MessageRail] Healthcheck failed — page structure changed. Reload to retry.'
        );
      }

      // Stop further healthchecks
      if (healthcheckTimer !== null) {
        clearInterval(healthcheckTimer);
        healthcheckTimer = null;
      }
    }
  }, HEALTHCHECK_INTERVAL_MS);
}

/**
 * Renders the sidebar while preserving the current search filter.
 */
function renderSidebarMessages(emptyState: SidebarEmptyState = 'no-messages'): void {
  if (!messageIndex || !sidebar) return;

  const query = currentSearchQuery.trim();
  const allMessages = messageIndex.getAll();
  const turnNumberByUid = createTurnNumberMap(allMessages);

  if (query === '') {
    sidebar.render(allMessages, { emptyState, turnNumberByUid });
    return;
  }

  const searchResults = messageIndex.search(currentSearchQuery);
  const filtered = filterMessagesForSidebarSearch(allMessages, searchResults);
  sidebar.render(filtered, {
    emptyState: filtered.length === 0 ? 'no-results' : emptyState,
    searchQuery: currentSearchQuery,
    turnNumberByUid,
  });
}

/**
 * Computes stable sidebar turn numbers from the full conversation.
 */
function createTurnNumberMap(messages: IndexedMessage[]): Map<string, number> {
  const turnNumberByUid = new Map<string, number>();
  let nextTurnNumber = 1;

  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }

    turnNumberByUid.set(message.uid, nextTurnNumber);
    nextTurnNumber++;
  }

  return turnNumberByUid;
}

// ── Chrome Runtime Messages ────────────────────────────────────────

/**
 * Listens for messages from the service worker (keyboard shortcuts).
 * Handles toggle-sidebar and focus-search commands.
 */
function setupRuntimeMessageListener(): void {
  try {
    chrome.runtime.onMessage.addListener(
      (message: { action?: string }, _sender, _sendResponse) => {
        if (!message?.action) return;

        switch (message.action) {
          case 'toggle-sidebar':
            if (sidebar) {
              sidebar.toggle();
              handleToggle();
            }
            break;

          case 'focus-search':
            if (sidebar) {
              sidebar.focusSearch();
            }
            break;

          default:
            console.debug('[MessageRail] Unknown action received:', message.action);
            break;
        }
      },
    );
  } catch {
    // Extension context may be invalidated (e.g., after extension update).
    // Degrade gracefully — sidebar remains functional but commands won't work.
    console.debug(
      '[MessageRail] Could not attach runtime message listener. Extension may have been updated.',
    );
  }
}

// ── SPA Navigation ─────────────────────────────────────────────────

/** Interval in milliseconds for URL polling fallback. */
const URL_POLL_INTERVAL_MS = 1000;

/** Timer ID for URL polling. */
let urlPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Handles SPA navigation by detecting URL changes and reinitializing.
 */
function handleNavigation(): void {
  const currentUrl = document.URL;
  if (lastUrl === '') {
    lastUrl = currentUrl;
    return;
  }

  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    teardown();
    void initialize();
  }
}

/**
 * Sets up listeners for SPA navigation events.
 *
 * Modern AI chat apps (ChatGPT, Claude, Gemini, Grok, Perplexity) use
 * history.pushState / replaceState for client-side navigation, which
 * does NOT fire popstate. We patch these methods to run the same URL
 * check, and add a polling fallback for any edge cases.
 */
function setupNavigationListeners(): void {
  if (urlPollTimer !== null) {
    return;
  }

  lastUrl = document.URL;

  // Standard browser navigation events
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);

  // Patch history.pushState and replaceState to run the same URL check.
  // SPAs use these to navigate between conversations without a page reload.
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>): void {
    originalPushState(...args);
    handleNavigation();
  };

  history.replaceState = function (...args: Parameters<typeof history.replaceState>): void {
    originalReplaceState(...args);
    handleNavigation();
  };

  // Polling fallback: catches edge cases where navigation happens
  // without pushState/replaceState (e.g. framework-specific routing).
  urlPollTimer = setInterval(handleNavigation, URL_POLL_INTERVAL_MS);
}

// ── Entry Point ────────────────────────────────────────────────────

/**
 * Content script entry point. Sets up navigation listeners,
 * runtime message handling, and kicks off initialization.
 */
function main(): void {
  setupRuntimeMessageListener();
  setupNavigationListeners();
  void initialize();
}

main();
