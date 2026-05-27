import type { Severity, Warning, WarningCode } from './index';

const TAXONOMY: Record<WarningCode, Omit<Warning, 'code'>> = {
  no_user_turn: {
    severity: 'blocker',
    title: 'No user message to continue from',
    explanation:
      'The captured conversation has no user turn. The receiving model has nothing concrete to act on.',
    recommendedAction: 'Provide a continuation instruction before transferring.',
  },
  budget_unmet: {
    severity: 'warning',
    title: 'Prompt exceeds target tokens',
    explanation:
      'After compression and final rendering, the prompt is over the chosen token budget.',
    recommendedAction:
      'Lower "Keep last K turns", reduce the recent window, or raise the target budget.',
  },
  digest_only: {
    severity: 'warning',
    title: 'No verbatim recent exchange',
    explanation:
      'The receiving model will see only compressed summaries. Continuity may degrade.',
    recommendedAction: 'Increase "Keep last K turns" to include at least one full exchange.',
  },
  extraction_partial: {
    severity: 'warning',
    title: 'Extraction may be incomplete',
    explanation:
      'Virtualization detection suggests some earlier messages may not have been captured.',
    recommendedAction:
      'Scroll to the very top of the source conversation and re-capture.',
  },
  low_confidence: {
    severity: 'warning',
    title: 'Low extraction confidence',
    explanation:
      'Several DOM selectors missed or the page fingerprint changed. The extracted conversation may be wrong.',
    recommendedAction: 'Review the timeline carefully before transferring.',
  },
  all_dropped_by_compose: {
    severity: 'blocker',
    title: 'Compose filters left nothing to send',
    explanation:
      'Your section toggles excluded every message. The receiving model would see only metadata.',
    recommendedAction: 'Re-enable at least one section, or restore a dropped message.',
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
