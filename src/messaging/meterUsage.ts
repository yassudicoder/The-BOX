import type { SourcePlatform } from '../types/conversation';
import type { ClaudeQuota } from '../core/context/quota';

/**
 * Latest context-meter reading the background stored for the side panel to
 * render. Local-only; holds an integer token estimate, never message content.
 *
 * Stored PER TAB under `${METER_USAGE_PREFIX}:<tabId>` so two supported chats
 * open at once never overwrite each other's reading (which would blank or
 * cross-show the meter in the panel).
 */
export const METER_USAGE_PREFIX = 'meter:usage';

export function meterUsageKey(tabId: number): string {
  return `${METER_USAGE_PREFIX}:${tabId}`;
}

/**
 * Claude EXACT usage reading, stored per tab under `${METER_QUOTA_PREFIX}:<tabId>`.
 * Separate from MeterUsage because it has a different producer (a poll, not the
 * DOM observer) and is Claude-only. Absence of the key = no exact data → the
 * panel/badge fall back to the estimate.
 */
export const METER_QUOTA_PREFIX = 'meter:quota';

export function meterQuotaKey(tabId: number): string {
  return `${METER_QUOTA_PREFIX}:${tabId}`;
}

export interface MeterQuota {
  quota: ClaudeQuota;
  /** Epoch ms when this reading was fetched. */
  at: number;
}

export interface MeterUsage {
  tabId: number;
  platform: SourcePlatform;
  /** Estimated whole-conversation tokens (numerator). */
  usedTokens: number;
  /** Messages actually seen and estimated total turns, for "~N turns" display. */
  seenTurns: number;
  expectedTurns: number;
  /** Platform reported its own hard length wall (Claude) → treat as 100%. */
  hardWall: boolean;
  /** Epoch ms of the reading. */
  at: number;
}
