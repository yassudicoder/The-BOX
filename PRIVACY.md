# Privacy

Continue AI is built to be the simplest possible thing privacy-wise: a
local-only tool. The extension itself sends nothing to any server. Your
conversation only goes to another AI when you choose to send it there.

## In plain language

- **Continue AI sends nothing.** The extension makes no network requests
  of its own. There is no Continue AI server — yours or ours — for it to
  send to.
- **You choose where the prompt goes.** Your conversation only goes to
  another AI when you choose to send it there. The extension prepares a
  transfer prompt and, when you click Copy, places it on your clipboard.
  Where it ends up is whichever AI you paste it into next.
- **Captures live in Chrome's local storage on this computer.** They are
  not synced to your other browsers and not sent anywhere.
- **No accounts, no signups, no logins.** There is nothing to sign into
  because there is no service behind the extension.
- **No analytics, no telemetry, no crash reports.** The extension does
  not measure usage, count clicks, or report errors back to anyone.
- **No ads, no third-party SDKs.** No advertising code, no tracking code,
  no data brokers.
- **No remote code.** Every line of JavaScript the extension runs is
  bundled into the package you install from the Chrome Web Store. The
  extension does not download, evaluate, or execute code from the
  internet.
- **You can wipe everything.** Side panel → Advanced settings → Storage →
  Clear all. That removes every captured conversation immediately.
  Uninstalling the extension does the same.

## What the extension reads

When you click Capture on a supported AI page (ChatGPT, Claude, Gemini),
the extension reads the visible conversation from that page's DOM. That
includes the messages, the conversation title, the model name, and the
URL. It reads nothing else and runs on no other page.

The supported hosts are:

- `chatgpt.com` — ChatGPT (the legacy `chat.openai.com` URL server-redirects
  here; we do not request `chat.openai.com` permission)
- `claude.ai` — Claude
- `gemini.google.com` — Gemini

Pages on any other site are not read by this extension and are not
eligible for capture.

## What the extension writes

- **Chrome local storage** (`chrome.storage.local`) — captured
  conversations are stored under per-conversation keys, capped at 50
  conversations. When you exceed the cap the oldest is removed.
- **Your downloads folder** — only when you click Export Markdown or
  Export JSON file. Files go wherever Chrome saves your downloads.
- **Your clipboard** — when you click "Copy prompt." The extension only
  *writes* to the clipboard; it never reads from it.

Nothing is written to Chrome sync storage. Sync storage would mean your
captures travel to your other signed-in browsers; that does not happen
here.

## Technical specifics (for reviewers and the curious)

These claims are verifiable by reading the source code:

| Permission | Requested for | Where it's used in source |
|---|---|---|
| `storage`   | Save captured conversations; hydrate the full-tab workspace on open. | `chrome.storage.local.get/set` in `persistConversation()` / `loadConversation()` in [`src/background/storage.ts`](src/background/storage.ts); hydration read in [`src/fullview/App.tsx`](src/fullview/App.tsx). |
| `sidePanel` | Open the side panel as the primary UI when the toolbar icon is clicked. | `chrome.sidePanel.setPanelBehavior` in [`src/background/index.ts`](src/background/index.ts). |
| `scripting` | Inject the content script into a supported AI tab when you click Capture. | `chrome.scripting.executeScript` in [`src/background/index.ts`](src/background/index.ts). |

Notable absences: the extension does **not** request `tabs` (broad tab
listing), `activeTab` (the four code paths that touch tabs are exercised
only against the three supported hosts, which `host_permissions` already
covers), `cookies`, `webRequest`, `webNavigation`, `history`, `bookmarks`,
`<all_urls>` host access, or `clipboardRead`.

### How the no-network claim is mechanically enforced

The build fails if any of the following patterns appear anywhere in
`src/` or `public/`:

- `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`
- `chrome.storage.sync`
- Remote font URLs (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`) and any
  reference to Google Fonts, Typekit, or Font Awesome
- Analytics SDK names: Google Analytics, Google Tag Manager, Mixpanel,
  Amplitude, Heap, Hotjar, FullStory, PostHog, Plausible, `analytics.js`,
  Segment
- The literal words `telemetry`, `trackEvent`, `recordMetric`, `beacon`

The test that enforces this lives at
[`tests/hardening/forbiddenPatterns.test.ts`](tests/hardening/forbiddenPatterns.test.ts).
A single-line opt-out (`// hardening-allow: <reason>`) exists for cases
where a forbidden word appears in copy or comments, but no such opt-out
is currently in use.

## Contact

If you find a privacy or security issue, please open an issue in the
project repository.
