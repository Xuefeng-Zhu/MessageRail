# Requirements Document

## Introduction

MessageRail is a privacy-first Manifest V3 browser extension that adds a universal "Message Index" sidebar to major AI chat web applications. The sidebar indexes visible user and assistant messages in the current conversation, numbers them, provides in-chat search, and enables jump-to-message navigation. The MVP targets ChatGPT as the first fully supported provider, with a provider-adapter architecture ready for Claude, Gemini, Grok, and Perplexity.

## Glossary

- **MessageRail**: The browser extension that provides message indexing, search, and navigation for AI chat web applications.
- **Sidebar**: A collapsible right-side panel injected into AI chat pages via Shadow DOM that displays the message index, search box, and pinned messages.
- **Provider**: A supported AI chat web application (ChatGPT, Claude, Gemini, Grok, or Perplexity).
- **Provider_Adapter**: A module implementing the SiteAdapter interface that extracts chat messages and context from a specific Provider's DOM.
- **Adapter_Registry**: A module that selects the correct Provider_Adapter based on the current page URL and document structure.
- **Message_Index**: An ordered list of ObservedMessage records extracted from the current conversation, each assigned a stable local ordinal number.
- **ObservedMessage**: A data record representing a single chat message with fields for role, text, status, and provider-specific identifiers.
- **ChatContext**: A data record describing the current conversation including provider identifier, chat ID, canonical URL, and title.
- **LiveAnchor**: An object that binds a message UID to a DOM element and provides scrollIntoView and accessibility focus methods.
- **Shadow_DOM**: A browser API used to encapsulate the Sidebar's markup and styles so that host-page CSS does not affect the Sidebar rendering.
- **MutationObserver**: A browser API used to detect DOM changes in the chat page so the Message_Index stays current as new messages appear or stream in.
- **Ordinal**: A sequential integer assigned to each message in the current conversation, starting from 1.
- **Pin**: A user-initiated bookmark on an indexed message that persists locally and surfaces the message with a visual marker.
- **Message_UID**: A deterministic local key derived from provider, chat ID, role, ordinal, and text checksum, used when no provider-native message ID exists.
- **Content_Script**: The extension script injected into supported AI chat pages that runs the Provider_Adapter, Message_Index, and Sidebar.
- **Service_Worker**: The Manifest V3 background script that handles extension lifecycle events and keyboard shortcut commands.
- **IndexedDB_Store**: A local IndexedDB database used to persist message records and pin metadata.
- **Preferences_Store**: A chrome.storage.local store used for lightweight user preferences and settings.

## Requirements

### Requirement 1: Extension Scaffold and Manifest

**User Story:** As a developer, I want a well-structured Manifest V3 extension scaffold with TypeScript, so that the extension loads correctly in Chromium browsers and is maintainable.

#### Acceptance Criteria

1. THE MessageRail SHALL use a Manifest V3 manifest file with a content script, a background service worker, and a popup or options page.
2. THE MessageRail SHALL compile from TypeScript source to JavaScript using a minimal build setup.
3. THE MessageRail SHALL load as an unpacked extension in Chromium-based browsers without errors.
4. THE MessageRail SHALL declare explicit host permissions scoped to `https://chatgpt.com/*`, `https://claude.ai/*`, `https://gemini.google.com/*`, `https://grok.com/*`, and `https://www.perplexity.com/*`.
5. THE MessageRail SHALL NOT declare the `<all_urls>` permission.
6. THE MessageRail SHALL NOT use `eval` or equivalent dynamic code execution.

### Requirement 2: Provider Detection and Adapter Architecture

**User Story:** As a developer, I want a provider-adapter architecture with a registry, so that adding support for new AI chat providers requires only implementing a new adapter module.

#### Acceptance Criteria

1. THE Adapter_Registry SHALL select the correct Provider_Adapter by calling each registered adapter's `canHandle` method with the current page URL and document.
2. WHEN the current page URL matches a supported Provider, THE Adapter_Registry SHALL return the corresponding Provider_Adapter.
3. WHEN the current page URL does not match any supported Provider, THE Adapter_Registry SHALL return null.
4. THE Provider_Adapter interface SHALL define the methods: `canHandle`, `getChatContext`, `scanVisible`, `observe`, `materializeMessage`, and `healthcheck`.
5. THE MessageRail SHALL include a fully implemented ChatGPT Provider_Adapter.
6. THE MessageRail SHALL include stub Provider_Adapters for Claude, Gemini, Grok, and Perplexity that implement the Provider_Adapter interface and return empty or placeholder results.

### Requirement 3: ChatGPT Adapter Message Extraction

**User Story:** As a user browsing ChatGPT, I want the extension to extract all visible chat messages accurately, so that I can see a complete index of the conversation.

#### Acceptance Criteria

1. WHEN the ChatGPT Provider_Adapter scans the document, THE ChatGPT Provider_Adapter SHALL extract both user and assistant messages from the DOM.
2. THE ChatGPT Provider_Adapter SHALL use structural CSS selectors rather than visible English label text to identify message elements.
3. THE ChatGPT Provider_Adapter SHALL assign a role of `user` or `assistant` to each extracted ObservedMessage.
4. THE ChatGPT Provider_Adapter SHALL extract the text content of each message into the ObservedMessage `text` field.
5. WHEN no provider-native message ID exists, THE ChatGPT Provider_Adapter SHALL generate a deterministic Message_UID from the provider name, current chat ID, role, ordinal, and a text checksum.
6. THE ChatGPT Provider_Adapter SHALL return an ObservedMessage with a `status` field set to `streaming` while an assistant response is still being generated, and `complete` when the response finishes.

### Requirement 4: DOM Observation and Live Updates

**User Story:** As a user, I want the message index to update automatically as new messages appear or stream in, so that the sidebar always reflects the current conversation state.

#### Acceptance Criteria

1. WHEN the ChatGPT Provider_Adapter's `observe` method is called, THE ChatGPT Provider_Adapter SHALL attach a MutationObserver to the chat container element.
2. WHEN the MutationObserver detects new message elements in the DOM, THE ChatGPT Provider_Adapter SHALL emit updated ObservedMessage records via the provided callback.
3. WHEN the MutationObserver detects changes to an existing assistant message element during streaming, THE ChatGPT Provider_Adapter SHALL emit an updated ObservedMessage with the latest text content.
4. THE ChatGPT Provider_Adapter SHALL NOT emit duplicate ObservedMessage records when the MutationObserver fires multiple times for the same DOM mutation.
5. WHEN the `observe` method's returned cleanup function is called, THE ChatGPT Provider_Adapter SHALL disconnect the MutationObserver.

### Requirement 5: Message Indexing and Ordinal Assignment

**User Story:** As a user, I want each message in the sidebar to have a stable number, so that I can reference messages by their position in the conversation.

#### Acceptance Criteria

1. THE Message_Index SHALL assign a sequential Ordinal starting from 1 to each ObservedMessage in the order the messages appear in the conversation.
2. WHEN new messages are added to the conversation, THE Message_Index SHALL assign the next sequential Ordinal to each new message without changing existing Ordinals.
3. THE Message_Index SHALL normalize message text by trimming leading and trailing whitespace and collapsing consecutive whitespace characters into a single space.
4. THE Message_Index SHALL deduplicate messages by comparing Message_UIDs so that each unique message appears exactly once in the index.

### Requirement 6: Sidebar Injection and Rendering

**User Story:** As a user, I want a sidebar panel on the right side of the AI chat page that shows the message index, so that I can browse and navigate the conversation.

#### Acceptance Criteria

1. WHEN the Content_Script detects a supported Provider page, THE Content_Script SHALL inject the Sidebar into the page using Shadow_DOM.
2. THE Sidebar SHALL render inside a Shadow_DOM root so that host-page CSS does not affect the Sidebar's styles.
3. THE Sidebar SHALL display each indexed message as a list item containing the Ordinal number, the message role label, and a short preview of the message text.
4. THE Sidebar SHALL NOT block or overlap the chat input area of the host page.
5. THE Sidebar SHALL use an `aside` or `nav` element with `aria-label="MessageRail message index"` as its root landmark.
6. THE Sidebar SHALL support collapsing and expanding via a toggle button.
7. WHEN the Sidebar is collapsed, THE Sidebar SHALL minimize to a narrow strip or icon that does not obstruct the chat page.

### Requirement 7: Jump-to-Message Navigation

**User Story:** As a user, I want to click a message in the sidebar to scroll to it in the chat, so that I can quickly navigate long conversations.

#### Acceptance Criteria

1. WHEN the user clicks a message item in the Sidebar, THE MessageRail SHALL scroll the corresponding original message element into view in the chat page.
2. WHEN the MessageRail scrolls to a message, THE MessageRail SHALL apply a temporary visual highlight or focus ring to the target message element for a minimum of 1 second.
3. THE LiveAnchor's `scrollIntoView` method SHALL use smooth scrolling behavior.
4. THE LiveAnchor's `focusForA11y` method SHALL move keyboard focus to the target message element or a focusable element within the target message.

### Requirement 8: In-Chat Search

**User Story:** As a user, I want to search within the current conversation's indexed messages, so that I can find specific messages without scrolling manually.

#### Acceptance Criteria

1. THE Sidebar SHALL display a search input field above the message list.
2. THE search input field SHALL be keyboard-focusable and have an accessible label.
3. WHEN the user types text into the search input, THE Sidebar SHALL filter the message list to show only messages whose text contains the search query as a case-insensitive substring match.
4. WHEN the search input is cleared, THE Sidebar SHALL restore the full message list.
5. THE search SHALL operate only on locally indexed message data and SHALL NOT make any network requests.

### Requirement 9: Message Pinning and Bookmarks

**User Story:** As a user, I want to pin important messages so that I can quickly find them later, even across sessions.

#### Acceptance Criteria

1. THE Sidebar SHALL display a pin button on each message list item.
2. WHEN the user clicks the pin button on a message, THE MessageRail SHALL persist the pin metadata and message text to the IndexedDB_Store.
3. WHEN a message is pinned, THE Sidebar SHALL display a visual marker on the pinned message item to distinguish it from unpinned messages.
4. THE Sidebar SHALL display pinned messages at the top of the message list or in a clearly separated pinned section.
5. WHEN the user clicks the pin button on an already-pinned message, THE MessageRail SHALL remove the pin and delete the pin record from the IndexedDB_Store.
6. WHEN the user reopens the Sidebar on the same conversation, THE MessageRail SHALL restore previously pinned messages from the IndexedDB_Store.

### Requirement 10: Local Storage

**User Story:** As a user, I want my message index data and pins stored locally on my device, so that my chat content is never transmitted externally.

#### Acceptance Criteria

1. THE MessageRail SHALL use the IndexedDB_Store for persisting message records and pin metadata.
2. THE MessageRail SHALL use the Preferences_Store for lightweight user preferences such as sidebar collapsed state.
3. THE MessageRail SHALL NOT use the host page's localStorage or sessionStorage.
4. THE MessageRail SHALL NOT transmit any chat message content, pin data, or user data over the network.
5. THE MessageRail SHALL NOT include telemetry, remote logging, or analytics of any kind.

### Requirement 11: Privacy and Security

**User Story:** As a user, I want the extension to operate with minimal permissions and no external communication, so that my AI chat conversations remain private.

#### Acceptance Criteria

1. THE MessageRail SHALL NOT make any network requests other than those initiated by the browser for extension store updates.
2. THE MessageRail SHALL request only the host permissions listed in Requirement 1, Acceptance Criterion 4.
3. THE MessageRail SHALL NOT use `eval`, `new Function()`, or any other dynamic code execution mechanism.
4. THE MessageRail SHALL NOT inject remote scripts, external fonts, or remote assets into the host page.
5. THE MessageRail manifest SHALL include a Content Security Policy that disallows `unsafe-eval` and remote script sources.

### Requirement 12: Sidebar UI and Accessibility

**User Story:** As a user, I want the sidebar to be visually clean, accessible, and compatible with light and dark modes, so that it integrates well with any AI chat page.

#### Acceptance Criteria

1. THE Sidebar SHALL detect the host page's color scheme or use neutral CSS custom properties to support both light and dark modes.
2. THE Sidebar SHALL render all styles from CSS contained within the Shadow_DOM, using no external stylesheets or remote assets.
3. THE Sidebar's jump buttons and pin buttons SHALL be keyboard-focusable and have accessible labels.
4. THE Sidebar's message list SHALL use semantic list markup (`ol` or `ul` with `li` elements).
5. THE Sidebar SHALL use only locally bundled fonts or system font stacks.

### Requirement 13: Keyboard Shortcuts

**User Story:** As a user, I want keyboard shortcuts to toggle the sidebar and focus the search field, so that I can use MessageRail efficiently without a mouse.

#### Acceptance Criteria

1. THE MessageRail SHALL register an extension command to toggle the Sidebar visibility.
2. THE MessageRail SHALL register an extension command to focus the Sidebar search input.
3. THE MessageRail SHALL NOT override common browser shortcuts including Ctrl+F, Cmd+F, Ctrl+T, Cmd+T, Ctrl+W, and Cmd+W.
4. WHEN the toggle sidebar command is activated, THE Service_Worker SHALL send a message to the Content_Script to toggle the Sidebar's collapsed state.
5. WHEN the focus search command is activated, THE Service_Worker SHALL send a message to the Content_Script to expand the Sidebar if collapsed and move keyboard focus to the search input.

### Requirement 14: Message Text Normalization and ID Generation

**User Story:** As a developer, I want deterministic message ID generation and consistent text normalization, so that message deduplication and matching are reliable.

#### Acceptance Criteria

1. THE Message_Index normalizer SHALL trim leading and trailing whitespace from message text.
2. THE Message_Index normalizer SHALL collapse consecutive whitespace characters (spaces, tabs, newlines) into a single space.
3. THE Message_UID generator SHALL produce identical UIDs for identical inputs of provider, chat ID, role, ordinal, and text content.
4. THE Message_UID generator SHALL produce different UIDs when any one input field differs.
5. FOR ALL valid ObservedMessage inputs, normalizing then generating a UID then normalizing the same text and generating a UID again SHALL produce the same Message_UID (idempotence property).

### Requirement 15: Streaming Message Handling

**User Story:** As a user, I want the sidebar to show assistant messages as they stream in, so that I can track the progress of long responses.

#### Acceptance Criteria

1. WHILE an assistant message has a status of `streaming`, THE Sidebar SHALL display the message item with a visual indicator that the message is still being generated.
2. WHEN an assistant message's status changes from `streaming` to `complete`, THE Sidebar SHALL update the message item to remove the streaming indicator and display the final preview text.
3. WHEN the text of a streaming assistant message changes, THE Message_Index SHALL update the existing message record rather than creating a new record.
4. THE Message_UID for a streaming message SHALL remain stable as the message text grows, using the ordinal and role rather than a text checksum until the message status becomes `complete`.

### Requirement 16: Testing

**User Story:** As a developer, I want automated tests for core logic modules, so that I can verify correctness and prevent regressions.

#### Acceptance Criteria

1. THE test suite SHALL include tests for Message_UID generation that verify deterministic output for identical inputs and different output for differing inputs.
2. THE test suite SHALL include tests for text normalization that verify whitespace trimming and collapsing.
3. THE test suite SHALL include tests for message deduplication that verify duplicate ObservedMessages are merged into a single index entry.
4. THE test suite SHALL include tests for the Adapter_Registry that verify correct Provider_Adapter selection based on URL.
5. THE test suite SHALL include tests for the ChatGPT Provider_Adapter that extract messages from a fixture HTML file located at `tests/fixtures/chatgpt-basic.html`.
6. FOR ALL randomly generated message text strings, normalizing the text and then normalizing the result again SHALL produce the same output as a single normalization (idempotence round-trip property).
