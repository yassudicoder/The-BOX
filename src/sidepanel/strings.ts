/**
 * Centralized user-facing copy for the side panel.
 *
 * All visible strings introduced or touched by the Advanced-settings
 * help-tooltip change live here so renames, tone tweaks, and (eventually)
 * translation happen in one place. Existing strings not touched by that
 * change still live near their components; this file establishes the
 * pattern without forcing a whole-codebase string migration.
 *
 * No engineering jargon (verbatim / digest / provenance / pipeline /
 * payload / serialize / schema / token-by-token). Copy reads as something
 * you'd say out loud to a non-developer.
 */
export const strings = {
  // ── Section headers and subtitles ─────────────────────────────────────
  advancedSettings: 'Advanced settings',
  advancedSettingsSubtitle:
    "Optional controls for fine-tuning what gets carried over and how it's packaged. The defaults work well for most people.",

  settings: 'Settings',

  include: 'Include',
  includeSubtitle:
    'Choose which parts of the original conversation to bring along.',

  storage: 'Storage',
  storageTip:
    "Saved conversations live in Chrome's local storage on this computer. Continue AI never uploads them.",

  // ── Settings fields ───────────────────────────────────────────────────
  target: 'Target',
  targetTip:
    'The AI tool you want to continue in — ChatGPT, Claude, or Gemini.',

  keepRecentMessages: 'Keep recent messages',
  keepRecentTip:
    'How many of your most recent messages to bring over word-for-word.',

  maxPromptSize: 'Maximum prompt size',
  /**
   * Unit suffix rendered inside the Maximum-prompt-size input. The tooltip
   * carries the *meaning* in plain language; the input carries the *unit*
   * so the user can answer "32000 of what?" at a glance. Complementary,
   * not redundant.
   */
  tokensUnit: 'tokens',
  maxPromptSizeTip:
    'How much of the conversation to fit into the new chat. Smaller is faster and cheaper; larger keeps more detail.',

  // ── Include section fields ────────────────────────────────────────────
  earlierContext: 'Earlier context',
  earlierContextTip:
    "Background from your original chat, so the new AI knows what you were already working on.",

  earlierSummary: 'Summary of earlier messages',
  earlierSummaryTip:
    'A short recap of older messages — the gist, without the full text, to save space.',

  recentMessages: 'Recent messages',
  recentMessagesTip:
    "Your latest messages, kept in full so the new AI picks up right where you left off.",

  pinnedInstructions: 'Pinned instructions',
  pinnedInstructionsTip:
    'Standing instructions you want the new AI to keep following, like your preferred tone or format.',

  generatedFiles: 'Generated files',
  generatedFilesTip:
    'Code, documents, or other files created during the conversation.',

  // ── Storage section ───────────────────────────────────────────────────
  clearAll: 'Clear all',
  capturesStored: (n: number): string =>
    `${n} ${n === 1 ? 'capture' : 'captures'} stored`,
  capturesStoredLoading: '…',
} as const;

export type StringKey = keyof typeof strings;

/** aria-label phrasing for help-tip triggers. */
export function helpAriaLabel(settingLabel: string): string {
  return `What does ${settingLabel} do?`;
}
