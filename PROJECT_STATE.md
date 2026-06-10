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

- 22 test files, 177 tests passing
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

## Deferred decisions

Decisions explicitly punted out of the current phase:

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
  a chunk-size warning. No code-splitting work scheduled.
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
