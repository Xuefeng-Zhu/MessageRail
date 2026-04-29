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
import { SidebarController } from './ui/sidebar-controller';
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

/** Tracks the last known URL for SPA navigation detection. */
let lastUrl: string = '';

/** Whether the extension runtime is still connected. */
let runtimeConnected = true;

/** Preferences store instance. */
const preferencesStore = new PreferencesStore();

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
}

// ── Initialization ─────────────────────────────────────────────────

/**
 * Main initialization routine. Polls for an adapter, sets up the
 * message index, mounts the sidebar, and wires all interactions.
 */
async function initialize(): Promise<void> {
  const registry = createRegistry();

  const adapter = await pollForAdapter(registry);
  if (!adapter) {
    console.debug('[MessageRail] No matching adapter found for this page. Exiting gracefully.');
    return;
  }

  currentAdapter = adapter;

  // Extract chat context
  const chatContext = adapter.getChatContext(document);

  // Create message index
  messageIndex = new MessageIndex();
  if (chatContext) {
    messageIndex.setChatContext(chatContext.provider, chatContext.chatId);
    // Pin loading disabled for now
    // await messageIndex.loadPins(chatContext.chatId);
  }

  // Scan visible messages
  try {
    const visibleMessages = adapter.scanVisible(document);
    messageIndex.update(visibleMessages);
  } catch (err) {
    console.error('[MessageRail] Error scanning visible messages:', err);
  }

  // Load sidebar collapsed preference
  const collapsed = await preferencesStore.get<boolean>('sidebarCollapsed');

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

  sidebar.render(messageIndex.getAll());

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
  const match = observed.find((m: ObservedMessage) => {
    // Match by ordinal position since UIDs may differ for streaming
    return observed.indexOf(m) === indexed.ordinal - 1;
  });

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
  sidebar.render(messageIndex.getAll());
}

/**
 * Handles search: filters messages by query and re-renders.
 * Empty query restores the full list.
 */
function handleSearch(query: string): void {
  if (!messageIndex || !sidebar) return;

  if (query.trim() === '') {
    sidebar.render(messageIndex.getAll());
  } else {
    // Pass all messages so render can pair user→assistant,
    // but search results determine which user messages to show
    const searchResults = messageIndex.search(query);
    const allMessages = messageIndex.getAll();
    // Filter: keep user messages that matched, plus all assistant messages for pairing
    const matchedUserUids = new Set(searchResults.filter(m => m.role === 'user').map(m => m.uid));
    const filtered = allMessages.filter(m => m.role === 'assistant' || matchedUserUids.has(m.uid));
    sidebar.render(filtered);
  }
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
    sidebar.render(messageIndex.getAll());
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
        sidebar.render(bannerMessages);
        // The empty render signals the "no messages" state.
        // For a more explicit banner, we log and let the empty state show.
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
    runtimeConnected = false;
    console.debug(
      '[MessageRail] Could not attach runtime message listener. Extension may have been updated.',
    );
  }
}

// ── SPA Navigation ─────────────────────────────────────────────────

/**
 * Handles SPA navigation by detecting URL changes and reinitializing.
 */
function handleNavigation(): void {
  const currentUrl = document.URL;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    teardown();
    initialize();
  }
}

/**
 * Sets up listeners for SPA navigation events.
 */
function setupNavigationListeners(): void {
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);
}

// ── Entry Point ────────────────────────────────────────────────────

/**
 * Content script entry point. Sets up navigation listeners,
 * runtime message handling, and kicks off initialization.
 */
function main(): void {
  setupRuntimeMessageListener();
  setupNavigationListeners();
  initialize();
}

main();
