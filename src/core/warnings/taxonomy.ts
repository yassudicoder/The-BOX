import type { Severity, Warning, WarningCode } from './index';

const TAXONOMY: Record<WarningCode, Omit<Warning, 'code'>> = {
  no_user_turn: {
    severity: 'blocker',
    title: 'No user message to continue from',
    explanation:
      'The captured conversation has no user turn. The receiving model has nothing concrete to act on.',
    recommendedAction: 'Fill in "What should the next AI do?" before copying.',
  },
  budget_unmet: {
    severity: 'warning',
    title: 'Prompt is over target size',
    explanation:
      'After compression and final rendering, the prompt is larger than the target prompt size you chose.',
    recommendedAction:
      'Open Advanced settings and either raise the target prompt size or uncheck a section in Include.',
  },
  digest_only: {
    severity: 'warning',
    title: 'No recent turns kept word-for-word',
    explanation:
      'The receiving model will see only shortened summaries. Continuity may degrade.',
    recommendedAction:
      'Open Advanced settings and raise "Keep last N turns word-for-word" to at least 2.',
  },
  extraction_partial: {
    severity: 'warning',
    title: 'Capture may be incomplete',
    explanation:
      'Some messages may not have been captured. Long chats load turns only as you scroll, so the oldest or the most recent turns can be missed.',
    recommendedAction:
      'Scroll through the whole conversation (top to bottom) so every turn loads, then capture again.',
  },
  low_confidence: {
    severity: 'warning',
    title: 'Low capture confidence',
    explanation:
      'Several page selectors missed or the page layout changed. The captured conversation may be wrong.',
    recommendedAction: 'Open Review to check the captured messages before copying.',
  },
  all_dropped_by_compose: {
    severity: 'blocker',
    title: 'Nothing left to send',
    explanation:
      'Your Include checkboxes excluded every message. The receiving model would see only metadata.',
    recommendedAction:
      'Open Advanced settings and re-enable at least one section under Include.',
  },
};

export function severityOf(code: WarningCode): Severity {
  return TAXONOMY[code].severity;
}

export function titleOf(code: WarningCode): string {
  return TAXONOMY[code].title;
}

export function makeWarning(code: WarningCode, overrides?: Partial<Warning>): Warning {
  return { code, ...TAXONOMY[code], ...overrides };
}
