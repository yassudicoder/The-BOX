import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(relPath: string, url: string): Document {
  const html = readFileSync(resolve(here, '..', 'fixtures', relPath), 'utf8');
  const win = new Window({ url });
  win.document.write(html);
  return win.document as unknown as Document;
}
