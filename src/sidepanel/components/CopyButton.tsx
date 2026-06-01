import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  disabled?: boolean;
  /** Shown when there's nothing yet to copy (e.g. capture hasn't happened). */
  emptyLabel?: string;
}

const COPIED_MS = 1500;

/**
 * The primary post-capture action. Full-width, brand-blue, switches to a
 * confirmation state for ~1.5s after a successful clipboard write so the user
 * gets unambiguous feedback without a separate toast surface.
 */
export const CopyButton = React.memo(function CopyButton({
  text,
  disabled = false,
  emptyLabel = 'Nothing to copy yet',
}: Props): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onClick = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Copy failed');
      setCopied(false);
    }
  }, [text]);

  const isEmpty = !text;
  const label = isEmpty
    ? emptyLabel
    : copied
      ? '✓ Copied — paste into your AI'
      : 'Copy prompt';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isEmpty}
        aria-label="Copy transfer prompt to clipboard"
        className={`w-full rounded-md px-3 py-3 text-[13px] font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50 ${
          copied
            ? 'bg-emerald-600 hover:bg-emerald-500'
            : 'bg-blue-500 hover:bg-blue-400'
        }`}
      >
        {label}
      </button>
      {error && (
        <p className="text-[11px] text-rose-300" role="alert">
          Couldn't copy: {error}
        </p>
      )}
    </div>
  );
});
