# Manual Smoke Test — Continue AI v1.0.0

These are the runtime checks **you** run in a real Chrome window before
calling the build submission-ready. I (Claude Code) have not done any of
this — runtime / CSP / "does it open" assertions only count when you
observe them in a browser.

## 0. Pre-flight

- [ ] You have a fresh Chrome window open (or a clean profile — recommended,
      so prior `chrome.storage.local` state doesn't mask issues).
- [ ] The latest production build exists at `dist/` (this report's rebuild
      produced one).
- [ ] You haven't loaded the extension yet. If a prior version is loaded,
      remove it first at `chrome://extensions/`.

## 1. Load unpacked

1. Open `chrome://extensions/`.
2. Top right: **Developer mode** toggle → ON.
3. **Load unpacked** → select the project's `dist/` folder.
4. The card should appear with name "Continue AI — Move your AI chat across
   ChatGPT, Claude & Gemini" and version `1.0.0`.

**Expected:** no red error banner on the card. If you see "Manifest file is
missing or unreadable" or any other red error: stop and tell me.

## 2. Open the side panel

5. Click the extension icon in the Chrome toolbar (puzzle piece → pin
   Continue AI first if needed).
6. The side panel should open on the right.

**Expected:** the side panel shows the title "Continue AI" and the
"Capture current conversation" button (since you haven't captured yet).

## 3. Capture, with DevTools open

7. Navigate the active tab to a real ChatGPT, Claude, or Gemini conversation
   (any conversation will do — capture works on the visible DOM).
8. **Right-click anywhere inside the side panel → Inspect.** Switch the
   DevTools to the **Console** tab. **Leave it open for the rest of this
   smoke test.**
9. Click **Capture current conversation** in the side panel.

**What to watch for:**

- **CSP violation appearance.** A CSP violation in the Chrome Console looks
  like this (paraphrasing the exact text):
  > `Refused to <load|connect to|evaluate> '<URL or 'inline'>' because it
  > violates the following Content Security Policy directive:
  > "<directive> 'self'".`
  If anything like that appears: **note the directive name** (e.g.
  `connect-src`, `script-src`) and the resource that was blocked. That's
  signal we need to look at the CSP I added in this pass.
- **The Vite module-preload fetch.** When the side panel first renders, Vite
  emits a tiny prefetch for the page's JS chunks. In the Console + Network
  tab you'll see a `fetch(...)` call with a URL like:
  `chrome-extension://<ID>/assets/main-XXXXXXXX.js` (the hash differs).
  This is **same-origin** (the extension's own origin is `'self'`), so it
  should be **allowed** by `connect-src 'self'`. If it shows up as
  blocked-by-CSP, the directive isn't doing what I think it's doing —
  flag this specifically.
- **Capture result.** After clicking, the side panel should switch to the
  post-capture state: capture status line, "What should the next AI do?"
  textarea, the prompt-size bar, the **Copy prompt** button, the transfer
  prompt preview.

## 4. Copy

10. Click **Copy prompt**.

**Expected:** button label briefly flips to "✓ Copied — paste into your AI"
for ~1.5 s, then back. Clipboard has the prompt (paste into a text editor
to confirm if you want).

## 5. Open full view — THE CRITICAL CHECK FOR THIS PASS

11. In the side panel, scroll to the right side of the "Transfer prompt"
    label and click **open full view ↗**.

**Expected:** a new Chrome tab opens. The tab loads the full-tab workspace
showing the same captured conversation and a sticky right-rail with the
Copy button.

> ⚠️ **This is the one check that genuinely depends on a behavior I removed
> this pass.** I removed `web_accessible_resources` from the manifest. Per
> MV3 docs, opening an extension-origin URL via `chrome.tabs.create` is a
> top-level extension-page navigation and does **not** require WAR. In
> practice this is the documented and standard behavior, but it's the one
> place this build's runtime can surprise you.

**If the tab fails to open** (blank tab, "this site can't be reached", or
the manifest banner reappears with an error after a moment): the WAR
fallback is staged in this report's appendix — apply it, rebuild, re-zip,
and re-run this step. Do not submit until step 5 succeeds.

## 6. Final Console sweep

12. With the workspace tab visible, also open its DevTools Console
    (`F12`).
13. Scroll/click around briefly in both the side panel Console and the
    workspace Console.

**Expected:** no CSP violations in either Console at any point during steps
3 through 5.

## 7. Tab-on-a-non-AI-host check (regression watch for the activeTab removal)

14. Switch the active tab to a non-AI page (any other site).
15. In the side panel, click **↻ Re-capture** in the header.

**Expected:** the side panel shows the error banner with text like
`unsupported_platform: tab is not a supported AI host: undefined`.
(The literal `undefined` rather than the actual URL is the expected minor
regression from removing `activeTab`. The extension's *functional*
behavior is unchanged — it still refuses to inject on non-AI tabs.)

If the error message instead shows the *actual* URL of the non-AI tab,
that means we still have URL-read permission from somewhere unexpected —
worth a heads-up.

## 8. Report back

When all of 1–7 land as expected, this build is ready for submission **in
your judgement**. If any step fails or surprises you, paste the Console
text and which step it came from.

---

## Appendix — WAR fallback diff (STAGED, NOT APPLIED)

If step 5 fails, this is the minimal change to restore extension-resource
access from a navigation context. Apply by editing `public/manifest.json`
to add the block below (anywhere inside the top-level object; suggested
just after `content_security_policy`).

```json
,
  "web_accessible_resources": [
    {
      "resources": ["src/fullview/index.html"],
      "matches": [
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*"
      ],
      "use_dynamic_url": true
    }
  ]
```

Notes on the fallback choice:

- `matches` mirrors the final tightened `host_permissions` exactly — same
  three hosts, no `<all_urls>`, no `chat.openai.com`.
- `use_dynamic_url: true` rotates the resource URL per session so the
  fullview page can't be reached by hard-coded `chrome-extension://<id>/...`
  references from outside the extension. Because the only caller
  (`src/sidepanel/App.tsx:108`) uses `chrome.runtime.getURL(...)`, it
  picks up the rotating URL automatically — no code change needed.

After editing the manifest, rebuild and re-zip:

```bash
rm -rf dist
NODE_ENV=production npm run build
# then re-run the staging + zip steps from this pass (PowerShell)
```

Then re-run **steps 1 through 6** of this smoke test.
