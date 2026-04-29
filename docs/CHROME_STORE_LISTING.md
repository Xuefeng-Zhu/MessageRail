# Chrome Web Store Listing Draft

Use this as paste-ready copy for the Chrome Developer Dashboard. Replace bracketed placeholders before submitting.

## Product Details

### Name

MessageRail

### Short Description

Privacy-first message index sidebar for navigating long AI chat conversations.

### Detailed Description

MessageRail adds a compact message index sidebar to supported AI chat apps so you can search, scan, and jump around long conversations without losing your place.

It is built for people who work in long AI chat threads and need fast navigation without sending their conversation data anywhere.

Key features:

- Message index sidebar for supported AI chat sites
- One-click jump to messages in the current conversation
- In-chat search across indexed message text
- Live updates while conversations stream
- Collapsible right-edge rail when you want the page back
- Light and dark mode support
- Keyboard shortcuts for opening the sidebar and focusing search
- Local-only storage for preferences and future pin state

Supported providers:

- ChatGPT
- Claude
- Gemini
- Grok
- Perplexity

Privacy posture:

- No telemetry
- No analytics
- No ads
- No remote code
- No network requests
- No sale or transfer of user data
- Indexed message data stays on your device

MessageRail only runs on the supported AI chat domains declared in its manifest. It does not request all-sites access.

## Category

Recommended: Productivity

## Language

English

## Website

[Add your public project, support, or privacy policy URL]

## Support URL

[Add GitHub issues, email, or another support URL]

## Privacy

### Single Purpose

MessageRail provides an on-page message index sidebar for supported AI chat applications, allowing users to search and navigate long conversations.

### Permission Justifications

#### storage

Used to save local extension preferences such as whether the sidebar is collapsed. MessageRail also includes local storage infrastructure for message pins. Data stays in the user's browser.

#### Host permissions

Required so MessageRail can inject its sidebar and read the conversation DOM on supported AI chat sites:

- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://grok.com/*`
- `https://www.perplexity.ai/*`
- `https://perplexity.ai/*`

MessageRail uses these permissions only to build the local message index and jump to messages on the current page.

### Data Collection Disclosure

Suggested answer: MessageRail does not collect user data.

If the dashboard asks about data handled locally, disclose that message text from supported AI chat pages is processed locally in the browser to build the sidebar index. It is not transmitted off-device.

### Limited Use Statement

MessageRail does not transfer user data to third parties. User data is used only to provide the extension's single purpose: local indexing, search, and navigation within supported AI chat conversations.

## Screenshots To Capture

- Sidebar open on a long ChatGPT conversation
- Search filtering the sidebar
- Jump target visible after clicking a sidebar item
- Collapsed right-edge rail tab
- Dark mode sidebar

Avoid screenshots containing private conversations. Use synthetic test prompts.
