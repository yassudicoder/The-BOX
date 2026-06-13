import React from 'react';
import {
  resolveContextWindow,
  readMeter,
  meterCopy,
  PLANS,
  type Plan,
  type MeterLevel,
} from '../../core/context/meter';
import type { MeterUsage } from '../../messaging/meterUsage';
import type { Settings } from '../../messaging/settings';

const LEVEL_BAR: Record<MeterLevel, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
};
const LEVEL_TEXT: Record<MeterLevel, string> = {
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-rose-300',
};

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

/**
 * Side-panel context meter. Renders the pure reading from core (estimated
 * fullness of the live conversation's context window) with an "~" everywhere and
 * an estimate tooltip. Presentation-only — all math lives in core/context.
 */
export function ContextMeter({
  usage,
  plan,
  onTransfer,
}: {
  usage: MeterUsage;
  plan: Plan;
  onTransfer: () => void;
}): JSX.Element {
  const { window: contextWindow, basis } = resolveContextWindow({
    platform: usage.platform,
    plan,
  });
  const reading = readMeter(usage.usedTokens, contextWindow, usage.hardWall);
  const copy = meterCopy(usage.platform, reading.level);
  const basisLabel =
    basis === 'model' ? 'based on the detected model' : `based on your ${PLAN_LABEL[plan]} plan`;

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-neutral-900/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-neutral-300">Context used (estimated)</span>
        <span
          className={`text-[12px] tabular-nums ${LEVEL_TEXT[reading.level]}`}
          title={`~${usage.usedTokens.toLocaleString()} of ~${contextWindow.toLocaleString()} tokens, ${basisLabel}. All numbers are estimates.`}
        >
          ~{reading.percent}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-1.5 ${LEVEL_BAR[reading.level]} transition-[width] duration-300`}
          style={{ width: `${Math.max(2, reading.percent)}%` }}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-400">{copy.long}</p>
      {copy.showTransferCta && (
        <button
          type="button"
          onClick={onTransfer}
          className="self-start rounded-md bg-rose-500/90 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
        >
          Transfer now →
        </button>
      )}
    </section>
  );
}

/**
 * Opt-in toggle + plan selector. The meter is OFF until the user enables it
 * here; while off, no page observation runs.
 */
export function MeterSettings({
  settings,
  onToggle,
  onPlan,
}: {
  settings: Settings;
  onToggle: (enabled: boolean) => void;
  onPlan: (plan: Plan) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={settings.contextMeterEnabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5"
        />
        <span className="flex flex-col">
          <span className="text-[12px] text-neutral-300">Show live context meter</span>
          <span className="text-[11px] leading-relaxed text-neutral-500">
            Estimates how full the current chat is. Counts locally on your computer — never sent
            anywhere.
          </span>
        </span>
      </label>
      {settings.contextMeterEnabled && (
        <div className="flex items-center gap-2 pl-6">
          <span className="text-[11px] text-neutral-400">My plan</span>
          <select
            value={settings.plan}
            onChange={(e) => onPlan(e.target.value as Plan)}
            className="rounded-md border border-white/5 bg-neutral-950/40 px-2 py-1 text-[11px] text-neutral-100 focus:border-blue-500/60 focus:outline-none"
            aria-label="My plan (sets the estimated context window)"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/**
 * One-time nudge after a capture/transfer on a chat estimated >50% of its
 * window. Dismissible; once answered it never shows again.
 */
export function MeterNudge({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div className="rounded-md border-l-2 border-blue-500 bg-blue-500/5 px-3 py-2 text-[12px]">
      <div className="text-neutral-200">This chat is getting large.</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">
        Turn on the live context meter to see how full it is? It counts locally and is never sent.
      </p>
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        <button
          type="button"
          onClick={onEnable}
          className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-blue-100 hover:bg-blue-500/20"
        >
          Turn on
        </button>
        <button type="button" onClick={onDismiss} className="text-neutral-400 hover:text-neutral-100">
          Not now
        </button>
      </div>
    </div>
  );
}
