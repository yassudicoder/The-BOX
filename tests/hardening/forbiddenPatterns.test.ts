import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, resolve, relative, sep, extname } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCAN_ROOTS = ['src', 'public'];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'icons',
  'fixtures',
  '__fixtures__',
]);

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.htm',
]);

const OPT_OUT_TOKEN = 'hardening-allow';

type Rule =
  | { kind: 'literal'; id: string; needle: string }
  | { kind: 'regex'; id: string; pattern: RegExp };

const RULES: readonly Rule[] = [
  { kind: 'literal', id: 'fetch(', needle: 'fetch(' },
  { kind: 'literal', id: 'XMLHttpRequest', needle: 'XMLHttpRequest' },
  { kind: 'literal', id: 'WebSocket', needle: 'WebSocket' },
  { kind: 'literal', id: 'navigator.sendBeacon', needle: 'navigator.sendBeacon' },
  { kind: 'literal', id: 'EventSource', needle: 'EventSource' },
  { kind: 'literal', id: 'chrome.storage.sync', needle: 'chrome.storage.sync' },

  {
    kind: 'regex',
    id: 'remote-font-url',
    pattern: /https?:\/\/[^\s'"<>]*\.(?:woff2?|ttf|otf|eot)\b/i,
  },
  {
    kind: 'regex',
    id: 'remote-font-cdn',
    pattern: /\b(?:fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|use\.fontawesome\.com)\b/i,
  },

  {
    kind: 'regex',
    id: 'analytics-sdk',
    pattern: /\b(?:google-analytics|googletagmanager|mixpanel|amplitude|heap\.io|hotjar|fullstory|posthog|plausible|analytics\.js)\b/i,
  },
  { kind: 'literal', id: 'gtag(', needle: 'gtag(' },
  { kind: 'literal', id: 'segment.io', needle: 'segment.io' },
  { kind: 'literal', id: 'segment.com', needle: 'segment.com' },

  { kind: 'regex', id: 'telemetry-keyword', pattern: /\btelemetry\b/i },
  { kind: 'regex', id: 'trackEvent', pattern: /\btrackEvent\b/ },
  { kind: 'regex', id: 'recordMetric', pattern: /\brecordMetric\b/ },
  { kind: 'regex', id: 'beacon-keyword', pattern: /\bbeacon\b/i },
];

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly snippet: string;
}

function isSkippedDir(name: string): boolean {
  return SKIP_DIR_NAMES.has(name);
}

function walkFiles(root: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true, encoding: 'utf8' }) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue;
      walkFiles(full, out);
    } else if (entry.isFile()) {
      if (!SCAN_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      out.push(full);
    }
  }
}

function matchRule(line: string, rule: Rule): boolean {
  return rule.kind === 'literal' ? line.includes(rule.needle) : rule.pattern.test(line);
}

function scanFile(absPath: string): Violation[] {
  const rel = relative(REPO_ROOT, absPath).split(sep).join('/');
  let text: string;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  const violations: Violation[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.includes(OPT_OUT_TOKEN)) continue;
    for (const rule of RULES) {
      if (matchRule(line, rule)) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
  return violations;
}

function formatViolations(violations: readonly Violation[]): string {
  const header = `Forbidden patterns detected (${violations.length}). ` +
    `Add a "// ${OPT_OUT_TOKEN}: <reason>" comment on the same line to opt out, or remove the offending code.`;
  const body = violations
    .map((v) => `  ${v.file}:${v.line}  [${v.rule}]  →  ${v.snippet}`)
    .join('\n');
  return `${header}\n${body}`;
}

describe('hardening: forbidden patterns', () => {
  it('src/ and public/ contain no forbidden network or telemetry patterns', () => {
    const files: string[] = [];
    for (const rootName of SCAN_ROOTS) {
      walkFiles(resolve(REPO_ROOT, rootName), files);
    }
    expect(files.length).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      violations.push(...scanFile(file));
    }

    if (violations.length > 0) {
      throw new Error(formatViolations(violations));
    }
    expect(violations).toEqual([]);
  });
});
