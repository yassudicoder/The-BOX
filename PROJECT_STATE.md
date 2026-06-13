# Project state

This document is the source of truth for what the Continue AI extension
currently supports, what is deferred, and the rules that govern changes
to it. Every claim below is true at the moment of writing
(2026-05-28). When you change the project, update this file in the same
commit.

## Current phase

UX polish. The functional product (capture → compress → transfer prompt → copy)
is complete for the three supported platforms. Current work focuses on:

- Side-panel and full-tab visual system refinement
- User-facing vocabulary cleanup (no internal pipeline terms in labels)
- States and accessibility gaps surfaced during dogfooding

Adding new platforms is out of scope for this phase unless explicitly re-scoped.

## Test status

- 26 test files, 199 tests passing
- Run with `npm test`
- Tests include a forbidden-pattern scan over `src/` and `public/`:
  `tests/hardening/forbiddenPatterns.test.ts`

## Supported platforms

| Platform | Extraction (capture from) | Transfer (paste into) |
|----------|---------------------------|------------------------|
| ChatGPT  | yes (`src/adapters/chatgpt/ChatGPTAdapter.ts`) | yes (`src/pipeline/transfer/adapters/chatgpt.ts`) |
| Claude   | yes (`src/adapters/claude/ClaudeAdapter.ts`)   | yes (`src/pipeline/transfer/adapters/claude.ts`)  |
| Gemini   | yes (`src/adapters/gemini/GeminiAdapter.ts`)   | yes (`src/pipeline/transfer/adapters/gemini.ts`)  |
| DeepSeek | no — needs DOM fixture | yes (`src/pipeline/transfer/adapters/deepseek.ts`) |
| Perplexity | no — needs DOM fixture | yes (`src/pipeline/transfer/adapters/perplexity.ts`) |
| Copilot  | no — needs DOM fixture | yes (`src/pipeline/transfer/adapters/copilot.ts`) |
| Grok     | no — needs DOM fixture | yes (`src/pipeline/transfer/adapters/grok.ts`) |
| Google AI Studio | no — needs DOM fixture | yes (`src/pipeline/transfer/adapters/aistudio.ts`) |

Extraction (capture-from) and transfer (paste-into) are now distinct type
domains, matching the long-standing design comment that target-side support
is broader than source-side:

- `Platform` (`src/types/conversation.ts`) is the full union of every target
  we can build a prompt for — all eight rows above.
- `SourcePlatform` is the strict subset we can scrape — `'chatgpt' | 'claude'
  | 'gemini'`. `RawConversation.platform` and `ConversationSource.platform`
  are typed `SourcePlatform`, so a non-scrapable platform can never be set as
  a capture origin by construction.

The transfer registry (`src/pipeline/transfer/adapters/index.ts`) is a
`Record<Platform, …>` and covers all eight. The extraction registry
(`src/adapters/base/AdapterRegistry.ts`) is an array and covers only the
three `SourcePlatform`s. The five transfer-only targets share one markdown
rendering shape via `createMarkdownTarget`
(`src/pipeline/transfer/adapters/markdownTarget.ts`); each platform file is a
thin config. They add **no manifest host-permissions** — transfer builds a
prompt the user pastes; it never injects into the target site — so
`PRIVACY.md` and the manifest are unchanged.

Host permissions matched against this table live in
[`public/manifest.json`](public/manifest.json); ChatGPT covers two hostnames
(`chat.openai.com` legacy and `chatgpt.com` current).

### In-page capture button

The manifest declares a `content_scripts` entry that auto-injects a tiny
(~2.5 KB) button script (`src/content/button.ts`, built via crxjs) on the three
capture-capable hosts. The button (`src/content/captureButton.ts`, a pure
Shadow-DOM factory) lets the user start a capture from the chat page itself.
On click it sends `CAPTURE_AND_OPEN`; the background opens the side panel and
writes a `capture:pending` flag (`src/messaging/pendingCapture.ts`), which the
panel consumes (on mount + `storage.onChanged`) to run its normal capture flow.

Once captured, the side panel shows a quiet **Save a copy** row
(`src/sidepanel/components/SaveCopyRow.tsx`) directly above the transfer card —
one-click download chips for PDF, HTML, Image, Markdown, and JSON. Transfer
(the Copy button) stays the only primary action; the row is the single home for
file export (it was removed from `Advanced`, which now holds only content
controls). The last-used format is remembered locally under the
`export:lastFormat` key in `chrome.storage.local`.

This is the only auto-injected content script; the ~1.1 MB extraction script is
still injected on demand by the background. The auto-injection is recorded in
`PRIVACY.md`. Note: `chrome.sidePanel.open()` requires a user gesture — the
background calls it first thing in the handler and falls back to the pending
flag, so a manual panel-open still captures if the gesture is rejected.

### Capture completeness (L1 shipped / L2 gated)

Extraction reads whatever is materialized in the live DOM, so long virtualized
conversations risk dropping the oldest or most-recent turns. Two layers guard
this; the canonical "incomplete" fact is `Conversation.stats.truncated`.

- **L1 (shipped, permanent).** `scrollToLoadConversation` (`src/pipeline/extract.ts`)
  scrolls to the top and tracks BOTH `scrollHeight` and the mounted-message count
  each pass — declaring the load complete only when both stop changing
  (`src/pipeline/completeness.ts`, happy-dom tested). If it never stabilizes, the
  capture is flagged. The flag is surfaced everywhere from one fact: the panel
  warning (`extraction_partial`), a note embedded in the transfer-prompt text, and
  the PDF / HTML / Markdown exports + JSON bundle. (Previously `extraction_partial`
  was defined but never emitted, and the flag only reached PDF/HTML.)
- **L2 (gated, browser-only).** When L1 flags incomplete OR a cheap geometry check
  shows unmounted content below the last visible message (the windowed-tail case
  L1's top-of-list check can't see), `recoverTail` sweeps to the end re-collecting
  via `adapter.collect(doc)` and merges by stable message id (`src/pipeline/merge.ts`,
  never by position). Normal fully-mounted chats hit neither trigger, so the fast
  path is untouched. After recovery the flag is honestly re-assessed. happy-dom
  can't model windowed virtualization, so L2's gate is the Playwright suite in
  `e2e/` plus the manual real-browser checklist (`e2e/README.md`) — run before
  release; not yet validated on live platforms.

### Context meter (opt-in, ships with the L2 release)

An optional "tokens left" meter estimating how full the live conversation's
context window is. **OFF by default** (`Settings.contextMeterEnabled`,
`src/messaging/settings.ts`) — while off, no observer runs and behaviour is
identical to v1.0.0.

- **Pure core** (`src/core/context/`): `meter.ts` (model/plan→window map,
  green/amber/red at 60%/85%, per-platform copy, badge colors) and `usage.ts`
  (delta token accumulation keyed by stable message id; index-based estimate of
  unmounted history — `(expectedTurns − seenTurns) × avgTokens/turn`). No DOM,
  no chrome.*, fully unit-tested.
- **Rides the L1 seam only.** The opt-in content script (`src/content/meter.ts`,
  built to `dist/meter-content.js`, ~18 KB) reads the currently-mounted messages
  via `adapter.collect` and a cheap char-based token estimate (no tokenizer in
  the content bundle). Hard rule: it NEVER scrolls and NEVER invokes L2 — the
  user's own scrolling enriches the estimate. A debounced MutationObserver
  recounts; counting suspends on `visibilitychange` hidden.
- **Injection is gated.** Background dynamically `registerContentScripts` the
  meter only while enabled and unregisters + clears badges when disabled, so the
  feature is truly zero-footprint when off. No new permissions/hosts.
- **Surfaces:** per-tab `chrome.action` badge (color + %; Gemini is panel-only,
  no badge) and a side-panel `ContextMeter`. A one-time nudge offers to enable
  the meter after a capture on a chat estimated >50% full.
- **Claude EXACT quota (`src/core/context/quota.ts`).** On Claude the meter does
  NOT estimate session/quota usage — it reads the user's real usage from
  claude.ai's own `GET /api/organizations/{orgId}/usage` (orgId from the
  `lastActiveOrg` cookie via `document.cookie`; same-origin credentialed fetch
  from the existing content script — no SSE tap, no MAIN-world injection). The
  parser normalizes both `resets_at` forms (ISO string or unix-epoch number → ms)
  and both utilization scales (0–1 or 0–100 → 0–1). The panel shows TWO meters,
  legibly split: an **exact** session+weekly quota (raw fraction + reset shown
  with no "~"; an "about N msgs left" projection via `MODEL_BURN_RATES` is the
  only hedged value) and the **approximate** context-window bar (tokenizer
  estimate, always "~"). The badge prefers the exact quota on Claude.
  - **This is the extension's one deliberate network call** — a same-origin read
    of the user's OWN data on claude.ai, credentialed, never sent off-device. It
    relaxes the "no outbound network" invariant for this opt-in path only,
    documented inline with a `// hardening-allow:` opt-out and disclosed in
    PRIVACY.md / PERMISSIONS.md. **No new permission/host** (existing
    `claude.ai/*` host + `document.cookie`, not the `cookies` permission).
  - **Resilience:** non-200, missing `five_hour`/`seven_day`, or any shape
    mismatch → `parseUsageResponse` returns null → the quota reading is dropped
    (never shown stale) and the panel/badge fall back to the estimate. The
    failure is logged. The endpoint is undocumented and WILL change.
- **Non-Claude (ChatGPT/Gemini):** no usage API exists → context-window estimate
  only; no fake quota meter (explicit fallback).
- **Gated:** ships in the same release as L2, after the manual real-browser pass.
  Meter checks for that gate (also in `e2e/README.md`): the **live observer**,
  **per-tab badge**, Claude **length-warning** behaviour, and specifically — the
  exact session fraction **matches Claude's own usage page**, the **reset
  countdown is correct**, and the **fallback fires** when `/usage` is blocked or
  its shape changes. None of these are exercisable in happy-dom. The
  model→window numbers and `MODEL_BURN_RATES` are empirical estimates needing
  calibration and are easy to edit.

## Dependencies

Runtime dependencies are kept lean; each must earn its place (engineering
invariant). Notable additions:

- **`jsPDF`** — powers one-click, full-conversation PDF export
  (`src/export/pdf.ts`). Justification: a user explicitly required a reliable
  PDF of the whole conversation. The prior browser-print approach could not
  guarantee this (popup blockers, dialog cancellation, image-load timing).
  jsPDF runs headlessly with no network and no DOM, so it preserves the
  local-only invariant and stays unit-testable. It is imported by the side
  panel's `Save a copy` row and the `fullview` export page — both
  extension-page UIs — but never by the content script.

## Deferred decisions

Decisions explicitly punted out of the current phase:

- **L2 tail-recovery release gate.** The L2 windowed-tail recovery (see *Capture
  completeness*) is implemented and gated behind `e2e/` (Playwright) + the manual
  real-browser checklist in `e2e/README.md`. It is NOT yet validated on live
  ChatGPT/Claude/Gemini virtualization. Before relying on it: install Playwright
  (`npm install && npx playwright install chromium`), run `npm run test:e2e`, and
  complete one manual 100+-turn pass per platform. L1's honest "incomplete" flag
  ships regardless, so a not-yet-recovered tail is never silently dropped.
- **Extraction (capture-from) for the transfer-only platforms** (DeepSeek,
  Perplexity, Copilot, Grok, Google AI Studio). Transfer *into* these shipped;
  scraping *from* them is gated on real DOM fixtures, because the project
  invariant requires fixture-driven testability for any DOM-reading code.
  Each needs a saved-HTML snapshot of a real conversation before an
  extraction adapter can be written and tested. Until then they are
  transfer-only. Other platforms (Open WebUI, etc.) remain unscoped.
- **Full accessibility audit**. Specific known gaps: `text-[10px]` sizing in
  several components; `text-neutral-500` on `bg-neutral-950` borderline pairs
  for some interactive elements; the 5-click debug-mode gesture is invisible
  and not keyboard-reachable.
- **Bundle-size reduction**. `dist/content-script.js` is ~1.1 MB. Build emits
  a chunk-size warning. No code-splitting work scheduled. Separately, both the
  side-panel and `fullview` page chunks bundle `jsPDF` (see Dependencies below)
  to offer one-click PDF export; these are extension-page bundles loaded on
  demand and do **not** affect the content script injected into AI sites.
- **Manifest description reconciliation**. `public/manifest.json` description
  still reads "between ChatGPT and Claude" and does not mention Gemini.
  Cosmetic; not blocking.
- **Tier-dropdown for "Maximum prompt size".** The Advanced > Settings input
  is a free-form number, but `TrimNotice`'s "Increase to next tier" already
  speaks in tiers (`8K / 16K / 32K / 64K / 128K`). The control and the
  notice use different mental models — the user clicks "Increase to next
  tier," the field jumps to a value the UI never presented as a tier.
  Unifying on a tier dropdown would make the control and the notice speak
  the same language. Deferred because the current free-form input works for
  power users; revisit when the audience model shifts toward consumer.

## Known risks

- **DOM-scrape fragility**. Extraction depends on the host platforms' DOM.
  ChatGPT, Claude, and Gemini ship UI changes regularly; any of the three
  adapters can break without warning. Mitigated by fixture-driven tests and
  the `AdapterProbe` mechanism, not eliminated.
- **Local-only data**. Captured conversations live in `chrome.storage.local`
  (see `persist()` / `load()` in `src/background/index.ts`). Clearing browser
  data, uninstalling the extension, or switching profiles destroys them.
  There is no sync, no backup, no recovery.
- **Minimum Chrome version**. The manifest sets `minimum_chrome_version: 116`
  for side-panel support. Older Chrome versions are not supported and have
  not been tested.
- **In-memory compose state**. The side panel's `compose` filters and the
  computed transfer prompt live in a Zustand store with no persistence layer.
  Closing the side panel discards the working state (the underlying captured
  conversation is persisted, but section toggles and excluded/restored IDs
  reset on next open).

## Architectural invariants

These are inlined here (not referenced from a separate file) so that any
prompt that loads this doc has the full contract.

Core:
- Local-only processing. No outbound network requests of any kind.
- No telemetry, analytics, or usage reporting.
- No cloud sync. Use `chrome.storage.local` only; never `chrome.storage.sync`.
- Compression passes are pure and synchronous — no Promises, no I/O, no LLM
  calls. The local-only trust story depends on this.
- Compose state never mutates `CompressedConversation`. Compose filters apply
  at render time only.
- Provenance metadata is immutable after generation.
- UI consumes provenance via `src/core/provenance` helpers. React components
  do not re-infer compression state from message content.
- New compression passes annotate provenance with explicit `reason` strings
  and record themselves in `passes[]`.
- New transfer targets implement `TransferTargetAdapter` in
  `src/pipeline/transfer/adapters/` and register in that directory's `index.ts`.
- New extraction adapters return `RawConversation` and register in
  `src/adapters/base/AdapterRegistry.ts`. They must also be added to the
  manifest's `host_permissions` and to `SUPPORTED_HOST_SUFFIXES` in
  `src/background/index.ts`.
- The recency pass's `affectedMessageIds` is the single source of truth for
  the digest/recent split. No duplicated cutoff logic elsewhere.
- Core pipeline modules (`src/core/`, `src/pipeline/`) stay framework-agnostic.
  No React, no DOM access, no `chrome.*` APIs in those directories.
- The side panel UI (`src/sidepanel/`) is presentation-only. No business
  logic, no compression rules, no inference about what compression did.

Engineering:
- Avoid overengineering. Prefer explicitness over clever abstractions.
- Strict TypeScript. No `any`, no unsound casts, no `as unknown as`.
- Fixture-driven testability for anything that reads the DOM.
- No new dependencies without justification — each must earn its place.
- Performance predictable for large conversations (memoization + stable
  keys). Virtualize only when profiled.

Documentation:
- This file is the supported-platforms source of truth. Every platform
  change updates the matrix above in the same commit.
- `PRIVACY.md` reflects the actual manifest permissions list. If a change
  adds a permission or host, `PRIVACY.md` updates in the same commit.

## Change review process

For any non-trivial change, the author (human or assistant) must produce, in
order, before writing implementation code:

1. The user problem being solved (the specific action that is currently
   friction or confusion).
2. The design approach, including what stays the same.
3. Anything that violates or pressures the invariants above, called out
   explicitly.
4. Tradeoffs — what was considered and rejected, and why.

Only after those four are on the page does implementation begin.

Trivial edits skip the gate: typo fixes, single-class adjustments, copy
tweaks that do not change information architecture. If a UX change requires
touching pipeline code, that is a signal the layering is being crossed —
stop and surface it instead of proceeding.
