import React from 'react';
import { useSidepanel } from '../state/store';
import type { ComposeState } from '../../pipeline/transfer';
import { strings } from '../strings';
import { HelpTip } from './HelpTip';

/**
 * IMPORTANT: `key` is the persisted internal identifier (also used by the
 * pipeline). It must not change — saved user settings depend on it.
 * `labelKey` and `tipKey` select the display text from the strings map.
 */
const SECTIONS: Array<{
  key: keyof ComposeState['sectionToggles'];
  labelKey:
    | 'earlierContext'
    | 'earlierSummary'
    | 'recentMessages'
    | 'pinnedInstructions'
    | 'generatedFiles';
  tipKey:
    | 'earlierContextTip'
    | 'earlierSummaryTip'
    | 'recentMessagesTip'
    | 'pinnedInstructionsTip'
    | 'generatedFilesTip';
}> = [
  { key: 'handoff', labelKey: 'earlierContext', tipKey: 'earlierContextTip' },
  { key: 'digest', labelKey: 'earlierSummary', tipKey: 'earlierSummaryTip' },
  { key: 'recent', labelKey: 'recentMessages', tipKey: 'recentMessagesTip' },
  { key: 'instructions', labelKey: 'pinnedInstructions', tipKey: 'pinnedInstructionsTip' },
  { key: 'artifacts', labelKey: 'generatedFiles', tipKey: 'generatedFilesTip' },
];

export function ComposeControls(): JSX.Element {
  const toggles = useSidepanel((s) => s.compose.sectionToggles);
  const toggle = useSidepanel((s) => s.toggleSection);
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        {strings.include}
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        {strings.includeSubtitle}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5 text-[12px] text-neutral-300">
        {SECTIONS.map(({ key, labelKey, tipKey }) => {
          const label = strings[labelKey];
          return (
            <label key={key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={() => toggle(key)}
                className="accent-blue-500"
              />
              <span>{label}</span>
              <HelpTip label={label} text={strings[tipKey]} />
            </label>
          );
        })}
      </div>
    </div>
  );
}
