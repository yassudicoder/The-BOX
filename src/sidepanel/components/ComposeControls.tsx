import React from 'react';
import { useSidepanel } from '../state/store';
import type { ComposeState } from '../../pipeline/transfer';

const SECTIONS: Array<{ key: keyof ComposeState['sectionToggles']; label: string }> = [
  { key: 'handoff', label: 'Handoff metadata' },
  { key: 'digest', label: 'Digest' },
  { key: 'recent', label: 'Recent exchange' },
  { key: 'instructions', label: 'Standing instructions' },
  { key: 'artifacts', label: 'Artifacts' },
];

export function ComposeControls(): JSX.Element {
  const toggles = useSidepanel((s) => s.compose.sectionToggles);
  const toggle = useSidepanel((s) => s.toggleSection);
  return (
    <fieldset className="rounded border border-neutral-800 p-2 text-xs">
      <legend className="px-1 text-neutral-400">Include</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {SECTIONS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={toggles[key]}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
