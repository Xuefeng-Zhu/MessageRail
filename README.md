# MessageRail

A privacy-first Manifest V3 browser extension that adds a universal "Message Index" sidebar to AI chat web applications. Browse, search, and navigate long conversations without scrolling.

## Features

- **Message Indexing** — Automatically indexes all visible messages in a conversation with stable ordinal numbers
- **Jump-to-Message** — Click any message in the sidebar to smooth-scroll to it in the chat
- **In-Chat Search** — Filter messages by keyword without leaving the page
- **Message Pinning** — Bookmark important messages for quick access across sessions
- **Live Updates** — Sidebar stays in sync as new messages stream in via MutationObserver
- **Privacy-First** — All data stored locally (IndexedDB + chrome.storage.local). Zero network requests, zero telemetry

## Supported Providers

| Provider | Status |
|----------|--------|
| ChatGPT | ✅ Fully implemented |
| Claude | 🔲 Stub (adapter interface ready) |
| Gemini | 🔲 Stub (adapter interface ready) |
| Grok | 🔲 Stub (adapter interface ready) |
| Perplexity | 🔲 Stub (adapter interface ready) |

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
3. Add the host permission to `manifest.json`
4. Add the content script match pattern to `manifest.json`

The `SiteAdapter` interface requires: `canHandle`, `getChatContext`, `scanVisible`, `observe`, `materializeMessage`, and `healthcheck`.

## License

Private — not published.
