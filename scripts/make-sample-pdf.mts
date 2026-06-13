/**
 * Generate a real, whole-conversation PDF from a captured fixture, end-to-end
 * through the actual pipeline: extract (adapter) -> normalize -> exportPdf.
 *
 * This is a demonstration / smoke artifact, not part of the test suite. It
 * proves the PDF export contains every user + assistant turn of a captured
 * conversation. Run it with vite-node so the TypeScript source imports resolve:
 *
 *   npx vite-node scripts/make-sample-pdf.mts
 *
 * Output: samples/sample-conversation.pdf
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

import { ChatGPTAdapter } from '../src/adapters/chatgpt/ChatGPTAdapter';
import { normalize } from '../src/pipeline/normalize';
import { exportPdf } from '../src/export/pdf';

const here = dirname(fileURLToPath(import.meta.url));

const fixturePath = resolve(here, '..', 'tests', 'fixtures', 'chatgpt', 'basic.html');
const html = readFileSync(fixturePath, 'utf8');

const win = new Window({ url: 'https://chatgpt.com/c/sample' });
win.document.write(html);
const doc = win.document as unknown as Document;

const adapter = new ChatGPTAdapter();
const raw = await adapter.extract({
  signal: new AbortController().signal,
  doc,
  scrollToLoadAll: async () => {},
});

const conv = normalize(raw);
// Give the sample a friendlier title than the bare fixture <title>.
conv.source.title = 'Quicksort in TypeScript — sample capture';

const bytes = exportPdf(conv, { title: conv.source.title });

const outDir = resolve(here, '..', 'samples');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'sample-conversation.pdf');
writeFileSync(outPath, Buffer.from(bytes));

const magic = String.fromCharCode(...new Uint8Array(bytes).slice(0, 5));
const roles = conv.messages.map((m) => m.role).join(' → ');

console.log('--- whole-conversation PDF generated ---');
console.log(`messages : ${conv.messages.length} (${roles})`);
console.log(`truncated: ${conv.stats.truncated}`);
console.log(`magic    : ${magic} (valid PDF: ${magic === '%PDF-'})`);
console.log(`bytes    : ${bytes.byteLength}`);
console.log(`written  : ${outPath}`);
