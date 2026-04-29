# MessageRail

A privacy-first Manifest V3 browser extension that adds a universal "Message Index" sidebar to AI chat web applications. Browse, search, and navigate long conversations without scrolling.

## Features

- **Message Indexing** — Automatically indexes all visible messages in a conversation with stable ordinal numbers
- **Jump-to-Message** — Click any message in the sidebar to smooth-scroll to it in the chat
- **In-Chat Search** — Filter messages by keyword without leaving the page
- **Message Pinning** — Bookmark important messages for quick access across sessions (infrastructure in place, UI currently disabled)
- **Live Updates** — Sidebar stays in sync as new messages stream in via MutationObserver
- **Streaming Detection** — Shows a visual indicator while assistant responses are being generated
- **SPA Navigation** — Automatically reinitializes when switching between conversations
- **Light/Dark Mode** — Adapts to the host page's color scheme via `prefers-color-scheme`
- **Privacy-First** — All data stored locally (IndexedDB + chrome.storage.local). Zero network requests, zero telemetry

## Supported Providers

| Provider | Status | Notes |
|----------|--------|-------|
| ChatGPT | ✅ Implemented | Production-tested, uses `data-message-author-role` attributes |
| Claude | ✅ Implemented | Uses `data-testid` and font class selectors with fallback strategies |
| Gemini | ✅ Implemented | Uses custom web components (`user-query`, `model-response`) |
| Grok | ✅ Implemented | Uses `data-testid` and `.response-content-markdown` selectors |
| Perplexity | ✅ Implemented | Uses `[id^="markdown-content-"]` for answer blocks |

All adapters include MutationObserver-based live updates, streaming detection, and LiveAnchor navigation. DOM selectors may need refinement as provider sites evolve.

## Architecture

MessageRail uses a **provider-adapter pattern** — each AI chat site has a dedicated adapter implementing a common `SiteAdapter` interface. An adapter registry selects the correct adapter at runtime based on the page URL.

```
src/
├── adapters/         # Provider adapters (ChatGPT, Claude, Gemini, Grok, Perplexity)
│   └── registry.ts  # Adapter registry — selects adapter by URL
├── core/
│   └── message-index.ts  # Ordinal assignment, deduplication, search
├── storage/
│   ├── indexeddb-store.ts    # Message records and pin persistence
│   └── preferences-store.ts # Lightweight user preferences
├── ui/
│   ├── sidebar-controller.ts # Shadow DOM sidebar rendering
│   └── live-anchor.ts        # Jump-to-message navigation
├── utils/
│   ├── normalize.ts  # Text normalization
│   └── uid.ts        # Deterministic message UID generation
├── background.ts     # Service worker (keyboard shortcut commands)
├── content.ts        # Content script entry point
├── popup.ts          # Extension popup page
└── types.ts          # Shared TypeScript interfaces
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Chromium-based browser (Chrome, Edge, Brave, etc.)

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript source into `dist/` using esbuild.

### Load as Unpacked Extension

1. Open `chrome://extensions` in your browser
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project root directory (where `manifest.json` lives)

### Run Tests

```bash
npm test
```

Tests use Vitest with jsdom and include unit tests, property-based tests (fast-check), integration tests, and smoke tests.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+M` | Toggle sidebar visibility |
| `Alt+Shift+M` | Focus search input |

These can be customized in `chrome://extensions/shortcuts`.

## Privacy & Security

- No `<all_urls>` permission — scoped to supported provider domains only
- No `eval()` or dynamic code execution
- No remote scripts, fonts, or external assets
- No network requests (no telemetry, no analytics, no remote logging)
- Content Security Policy: `script-src 'self'; object-src 'none'`
- Sidebar injected via Shadow DOM to isolate styles from host pages

## Development

### Tech Stack

- **Language**: TypeScript
- **Build**: esbuild
- **Testing**: Vitest + fast-check (property-based testing) + jsdom
- **Storage**: IndexedDB (structured data) + chrome.storage.local (preferences)
- **UI Isolation**: Shadow DOM

### Adding a New Provider

1. Create a new adapter file in `src/adapters/` implementing the `SiteAdapter` interface
2. Register it in `src/adapters/registry.ts`
3. Import and register the adapter in `src/content.ts` (`createRegistry` function)
4. Add the host permission to `manifest.json`
5. Add the content script match pattern to `manifest.json`
6. Add a fixture HTML file in `tests/fixtures/`
7. Add an integration test in `tests/integration/`

The `SiteAdapter` interface requires: `canHandle`, `getChatContext`, `scanVisible`, `observe`, `materializeMessage`, and `healthcheck`.

### How It Works

1. The content script (`content.ts`) polls for a matching adapter on page load
2. Once matched, it extracts the chat context and scans visible messages
3. The message index assigns ordinals, normalizes text, and deduplicates
4. The sidebar controller renders the message list inside a Shadow DOM host
5. A MutationObserver watches for new/changed messages and updates the index live
6. A healthcheck runs every 5 seconds to detect DOM structure changes
7. SPA navigation (conversation switches) triggers a full teardown and reinit

## Known Limitations

- Message pinning UI is currently disabled (storage infrastructure is in place)
- Popup page is a stub — not yet implemented
- Adapter DOM selectors may need updates as provider sites change their markup

## License

Private — not published.
