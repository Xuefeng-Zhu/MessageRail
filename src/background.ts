// MessageRail — Service Worker (background script)
// Handles keyboard shortcut commands and forwards them to the active tab's content script.

const KNOWN_COMMANDS = ['toggle-sidebar', 'focus-search'] as const;
type KnownCommand = (typeof KNOWN_COMMANDS)[number];

function isKnownCommand(command: string): command is KnownCommand {
  return (KNOWN_COMMANDS as readonly string[]).includes(command);
}

/**
 * Queries the active tab in the current window and sends a message
 * with the given action to its content script.
 */
async function forwardCommandToActiveTab(action: string): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    console.warn('[MessageRail] No active tab found to forward command:', action);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch (error) {
    // Content script may not be ready or the tab may not have a content script injected.
    // This is expected on non-supported pages — swallow the error silently.
    console.debug(
      '[MessageRail] Could not send message to tab %d for action "%s":',
      tab.id,
      action,
      error
    );
  }
}

chrome.commands.onCommand.addListener((command: string) => {
  if (isKnownCommand(command)) {
    forwardCommandToActiveTab(command);
  } else {
    console.debug('[MessageRail] Unknown command received:', command);
  }
});
