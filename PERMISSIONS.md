# Permissions

## Single-purpose statement

Continue AI does exactly one thing: capture the conversation visible on an
AI chat page (ChatGPT, Claude, or Gemini) and prepare a transfer prompt the
user can paste into another supported AI to continue the conversation
there. Your conversation only goes to another AI when you choose to send
it there. Every permission below is in service of that single purpose.
The extension performs no other activity, observes no other pages, and
sends no data to its authors or any third party — it has no server. (The
optional context meter, off by default, makes one kind of request: a
same-origin read of your own usage data from claude.ai itself, described
below. That request goes to claude.ai — the site you are already on —
never to us.)

## Permissions and why they're requested

| Permission | One-line justification |
|---|---|
| `storage`   | Save captured conversations and your settings to Chrome's local storage so they're still there next time you open the panel. |
| `sidePanel` | Open the side panel as the primary UI when the toolbar icon is clicked. |
| `scripting` | Inject the conversation-reading script into the supported AI tab the moment you click Capture. |

The extension does **not** request `tabs`, `activeTab`, `cookies`,
`webRequest`, `webNavigation`, `history`, `bookmarks`, `<all_urls>` host
access, or `clipboardRead`.

`activeTab` is deliberately omitted: all four code paths that need tab
access (`tabs.query`, `tabs.get`, `scripting.executeScript`,
`tabs.sendMessage`) are exercised only against the three supported AI
hosts, which are already covered by `host_permissions`. Granting
`activeTab` would only add the ability to read `tab.url` on tabs that
aren't in our supported set, which the extension never does.

## Host permissions and why they're requested

The extension reads pages only on the AI hosts it knows how to read:

| Host pattern | One-line justification |
|---|---|
| `https://chatgpt.com/*`       | ChatGPT (current canonical hostname). Required so the content script can be injected when you click Capture on a ChatGPT page. |
| `https://claude.ai/*`         | Claude. Required so the content script can read the conversation when you click Capture on a Claude page. |
| `https://gemini.google.com/*` | Gemini. Required so the content script can read the conversation when you click Capture on a Gemini page. |

These three hosts are the complete list. The extension does not have
permission to read any other site and is not eligible to be triggered on
any other site.

`chat.openai.com` is deliberately omitted: it server-redirects to
`chatgpt.com` before a tab becomes interactable, so the active tab URL
the extension sees is always `chatgpt.com`. Granting access to
`chat.openai.com` would add a permission surface that the extension
cannot actually use.

## Optional context meter — Claude usage read (reviewer note)

The optional context meter (OFF by default) shows how full your current
chat is. On **Claude only**, when you turn it on, it reads your **own
account usage** directly from claude.ai's own usage API
(`GET /api/organizations/{id}/usage`) so it can show your real session and
weekly usage instead of an estimate.

- **No new permission is requested for this.** The request is **same-origin**
  on `claude.ai`, which the content script already runs on under the existing
  `https://claude.ai/*` host permission. The organization id is read from the
  page's own `document.cookie` (the standard web API available to any script
  on the page) — the extension does **not** request the `cookies` permission
  and does not use the `chrome.cookies` API.
- **What is read:** only *your own* usage figures (the same numbers Claude
  already shows you), using your existing signed-in session.
- **Why:** to render the opt-in usage/quota meter (session %, weekly %, reset
  countdown, and an estimated messages-remaining figure).
- **Where it goes:** nowhere. It is processed on your device and shown to you;
  it is never stored long-term and never transmitted to the extension's
  authors or any third party. There is no server.
- **Gating:** this read happens only while the meter is enabled; turning the
  meter off makes zero such requests.

## Why the extension does not request broader permissions

- **`tabs`** — would grant access to every open tab's URL and title.
  Continue AI does not enumerate tabs and does not need URLs of tabs
  the user has not asked it to capture from.
- **`activeTab`** — would grant temporary access to the URL of any
  active tab on user gesture. Continue AI only needs URLs for the three
  supported AI hosts, which `host_permissions` already covers.
- **`<all_urls>` host access** — would allow reading content on every
  website. Continue AI reads content only on the three supported AI
  hosts.
- **`cookies`, `history`, `bookmarks`, `webNavigation`, `webRequest`** —
  not needed for capture-and-transfer; not requested.
- **`clipboardRead`** — Continue AI writes the transfer prompt to the
  clipboard when the user clicks Copy. It never reads from the clipboard.
