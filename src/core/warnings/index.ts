export type Severity = 'blocker' | 'warning' | 'info';

export type WarningCode =
  | 'no_user_turn'
  | 'budget_unmet'
  | 'digest_only'
  | 'extraction_partial'
  | 'low_confidence'
  | 'all_dropped_by_compose';

export interface Warning {
  code: WarningCode;
  severity: Severity;
  title: string;
  explanation: string;
  recommendedAction: string;
}

export { severityOf, titleOf, makeWarning } from './taxonomy';
