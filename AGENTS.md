# Agent Guidelines for MessageRail

This document provides context and conventions for AI agents working on this codebase.

## Project Overview

MessageRail is a privacy-first Manifest V3 browser extension that injects a message index sidebar into AI chat web applications (ChatGPT, Claude, Gemini, Grok, Perplexity). It uses a provider-adapter architecture where each site has a dedicated adapter implementing the `SiteAdapter` interface.

## Build & Test Commands

```bash
npm run build     # Compile TypeScript → dist/ via esbuild (IIFE format)
npm test          # Run all tests (vitest run)
npm run test:watch  # Run tests in watch mode
```

## Tech Stack

- TypeScript (strict mode, ES2020 target)
- esbuild for bundling (IIFE output, no framework)
- Vitest + jsdom for testing
- fast-check for property-based tests
- fake-indexeddb for storage tests
- Shadow DOM for UI isolation
- IndexedDB for persistence, chrome.storage.local for preferences

## Code Conventions

- Use TypeScript strict mode — no `any` unless absolutely necessary
- Prefer interfaces over type aliases for object shapes
- Export interfaces and types from `src/types.ts`
- Use explicit return types on public methods
- No default exports — use named exports everywhere
- No external runtime dependencies — the extension must be self-contained
- No `eval()`, `new Function()`, or dynamic code execution
- No network requests of any kind (fetch, XHR, WebSocket)
- CSS lives inside Shadow DOM — never inject global styles

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Extension (MV3)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐         chrome.runtime          ┌──────────┐ │
│  │   Service    │◄──────── messages ──────────────►│  Popup   │ │
│  │   Worker     │                                  │  Page    │ │
│  │ background.ts│                                  │ popup.ts │ │
│  └──────┬───────┘                                  └──────────┘ │
│         │                                                       │
│         │ chrome.runtime messages                                │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Content Script (content.ts)                 │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           Adapter Registry (registry.ts)        │    │    │
│  │  │                                                 │    │    │
│  │  │  ┌─────────┐ ┌───────┐ ┌────────┐ ┌────────┐  │    │    │
│  │  │  │ ChatGPT │ │Claude │ │ Gemini │ │  Grok  │  │    │    │
│  │  │  │ Adapter │ │ Stub  │ │  Stub  │ │  Stub  │  │    │    │
│  │  │  └────┬────┘ └───────┘ └────────┘ └────────┘  │    │    │
│  │  └───────┼────────────────────────────────────────┘    │    │
│  │          │                                              │    │
│  │          │ ObservedMessage[]                            │    │
│  │          ▼                                              │    │
│  │  ┌──────────────────┐        ┌─────────────────────┐   │    │
│  │  │  Message Index   │───────►│  Sidebar Controller │   │    │
│  │  │  (core)          │        │  (Shadow DOM)       │   │    │
│  │  │                  │        │                     │   │    │
│  │  │  • ordinals      │        │  • message list     │   │    │
│  │  │  • deduplication │        │  • search input     │   │    │
│  │  │  • search        │        │  • pin buttons      │   │    │
│  │  │  • pin state     │        │  • toggle collapse  │   │    │
│  │  └────────┬─────────┘        └──────────┬──────────┘   │    │
│  │           │                              │              │    │
│  │           ▼                              ▼              │    │
│  │  ┌────────────────┐          ┌────────────────────┐    │    │
│  │  │ IndexedDB Store│          │    LiveAnchor      │    │    │
│  │  │ (messages/pins)│          │ (scrollIntoView)   │    │    │
│  │  └────────────────┘          └─────────┬──────────┘    │    │
│  │                                        │               │    │
│  │  ┌────────────────┐                    │               │    │
│  │  │Preferences Store│                   │               │    │
│  │  │(chrome.storage) │                   │               │    │
│  │  └────────────────┘                    │               │    │
│  └────────────────────────────────────────┼───────────────┘    │
│                                           │                     │
└───────────────────────────────────────────┼─────────────────────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │  Host Page DOM │
                                   │  (ChatGPT etc) │
                                   └────────────────┘
```

### Data Flow

```
Host Page DOM
    │
    │ MutationObserver
    ▼
Provider Adapter ──► ObservedMessage[] ──► Message Index ──► Sidebar Controller
    │                                          │                     │
    │                                          │ persist             │ user click
    │                                          ▼                     ▼
    │                                    IndexedDB Store       LiveAnchor
    │                                                              │
    │◄─────────────────────────────────────────────────────────────┘
    │                                                    scrollIntoView
    ▼
Host Page DOM (scroll to message)
```

## Architecture Rules

- **Adapters** (`src/adapters/`): Each provider gets its own file implementing `SiteAdapter`. Register new adapters in `registry.ts`.
- **Core** (`src/core/`): Business logic (message indexing, deduplication, ordinal assignment). No DOM access here.
- **Storage** (`src/storage/`): IndexedDB and chrome.storage wrappers. No UI logic.
- **UI** (`src/ui/`): Shadow DOM sidebar and navigation. Receives data from core, never calls adapters directly.
- **Utils** (`src/utils/`): Pure functions (text normalization, UID generation). No side effects.

## Testing Conventions

- Property-based tests go in `tests/properties/` with `.prop.test.ts` suffix
- Unit tests go in `tests/unit/` with `.test.ts` suffix
- Integration tests go in `tests/integration/`
- Smoke tests (static analysis checks) go in `tests/smoke/`
- HTML fixtures go in `tests/fixtures/`
- Property tests must run with `{ numRuns: 100 }` minimum
- Mock `chrome.*` APIs using vitest mocks (see `tests/setup.test.ts`)

## File Naming

- Kebab-case for all filenames: `sidebar-controller.ts`, `message-index.ts`
- Test files mirror source: `src/core/message-index.ts` → `tests/unit/message-index.test.ts`

## Security Constraints

These are hard requirements — never violate them:

1. No `<all_urls>` permission in manifest
2. No `eval` or `new Function`
3. No remote scripts, fonts, or assets
4. No network requests (no fetch, XHR, WebSocket)
5. No telemetry or analytics
6. CSP: `script-src 'self'; object-src 'none'`
7. Don't touch host page's localStorage/sessionStorage

## Adding a New Provider

1. Create `src/adapters/<provider>.ts` implementing `SiteAdapter`
2. Register in `src/adapters/registry.ts`
3. Add host permission + content script match in `manifest.json`
4. Add fixture HTML in `tests/fixtures/`
5. Add integration test in `tests/integration/`
