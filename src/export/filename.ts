/**
 * Shared download-filename helper for the export layer.
 *
 * Both the full-tab ExportBar and the side-panel "Save a copy" row turn a
 * conversation title into a safe, human-readable base name. Kept here so the
 * sanitisation rules live in exactly one place.
 */

/**
 * Turn a conversation title into a filesystem-safe base name (no extension).
 * Strips characters illegal in filenames, collapses whitespace to dashes, and
 * caps the length. Falls back to "conversation" when nothing usable remains.
 */
export function sanitizeExportName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || 'conversation';
}
