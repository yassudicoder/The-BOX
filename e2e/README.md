# Capture-completeness E2E (gated L2)

These browser tests are the release gate for **L2 tail-recovery** — the bounded
scroll-to-end sweep that recovers the most-recent turns a *windowed* virtualizer
unmounts while we sit at the top of a long conversation.

happy-dom (used by `npm test`) has no layout and does not mount/unmount on
scroll, so it cannot exercise L2. These run in real Chromium instead.

## What's here

- `fixtures/virtualized-chatgpt.html` — a synthetic 120-turn conversation that
  truly windows the DOM (only a slice is mounted; a spacer keeps `scrollHeight`
  stable). Uses ChatGPT-compatible selectors so the real adapter extracts it.
- `entry.ts` — exposes the real `extractFromDocument` on `window`.
- `l2-recovery.spec.ts` — loads the fixture as `chatgpt.com` (via route), runs
  the real pipeline, asserts all 120 turns are recovered, in order, with
  `truncated === false`.

## Run

```bash
npm install                 # picks up @playwright/test + esbuild
npx playwright install chromium
npm run test:e2e
```

CI should run `npm run test:e2e` after `npm ci && npx playwright install --with-deps chromium`.

## Manual real-browser checklist (before each release)

Automated coverage can't fully model every platform's live virtualization, so
verify L1+L2 by hand on a **real, long conversation (100+ turns) on each
platform**: ChatGPT, Claude, Gemini.

For each platform:

1. Open a conversation with **100+ turns**. Scroll **up** to an old message, then
   trigger a capture (the in-page button or the toolbar icon).
2. **Captured count == visible count.** Open *Review what's being sent* in the
   panel and confirm the message count matches the real conversation length
   (scroll the source to the bottom and eyeball the last few turns).
3. **Last message matches.** The final turn in the capture (and in a PDF export)
   is the actual most-recent turn in the source — not an older one.
4. **First message matches.** The opening user prompt is present (not silently
   dropped).
5. **Honest flag when incomplete.** If recovery genuinely can't get everything
   (e.g. an extremely long thread that exceeds the step/time budget), confirm the
   **"Capture may be incomplete"** warning shows in the panel, in the transfer
   prompt text, and in the PDF / Markdown exports — i.e. it is never silently
   partial.
6. **Fast path untouched.** On a short conversation (fully mounted), capture is
   instant — no extra scrolling, no warning.

Record platform + adapter `selectorVersion` (visible in the debug extraction
log) with each manual pass, since virtualization is site-controlled and can
regress on a vendor UI change.
