import { ulid } from '../utils/ulid';
import type {
  Block,
  Conversation,
  Message,
  Role,
} from '../types/conversation';
import { CONVERSATION_SCHEMA_VERSION } from '../types/conversation';
import type { RawConversation, RawMessage } from '../types/raw';
import { htmlToMarkdown } from '../adapters/base/htmlToMarkdown';
import { estimateTokens } from './tokens/estimate';

export function normalize(raw: RawConversation): Conversation {
  // Per-extraction nonce makes the artifact sentinel non-spoofable: a user
  // pasting the literal text "<!-- artifact identifier=... -->" into a chat
  // cannot conjure an artifact block, because they cannot guess the nonce.
  const artifactNonce = makeNonce();
  const messages = raw.messages.map((m) => normalizeMessage(m, artifactNonce));
  const approxTokens = messages.reduce((sum, m) => sum + m.approxTokens, 0);

  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    id: ulid(),
    source: {
      platform: raw.platform,
      url: raw.url,
      title: raw.title,
      model: raw.model,
      capturedAt: new Date().toISOString(),
    },
    messages,
    stats: {
      messageCount: messages.length,
      approxTokens,
      truncated: raw.truncated,
    },
  };
}

function normalizeMessage(raw: RawMessage, artifactNonce: string): Message {
  const markdown = htmlToMarkdown(raw.html, { artifactNonce });
  const blocks = parseBlocks(markdown, { artifactNonce });
  return {
    id: raw.sourceId ?? ulid(),
    role: raw.role as Role,
    content: markdown,
    blocks,
    approxTokens: estimateTokens(markdown),
    createdAt: raw.createdAt,
  };
}

export interface ParseBlocksOptions {
  artifactNonce?: string;
}

export function parseBlocks(markdown: string, opts: ParseBlocksOptions = {}): Block[] {
  const blocks: Block[] = [];
  const nonce = escapeRegex(opts.artifactNonce ?? '');
  // Sentinel must include the nonce. With no nonce ("") the group only
  // matches the bare prefix — kept for tests and back-compat reads.
  const sentinel = nonce ? `artifact:${nonce}` : 'artifact(?::[\\w-]*)?';
  const fence = new RegExp(
    `(?:^|\\n)(<!-- ${sentinel} ([^>]*) -->\\n)?(\`{3,})([\\w+-]*)\\n([\\s\\S]*?)\\n\\3(?=\\n|$)`,
    'g'
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    const matchStart = match.index + (markdown[match.index] === '\n' ? 1 : 0);
    if (matchStart > lastIndex) {
      pushTextWithMath(blocks, markdown.slice(lastIndex, matchStart));
    }
    const artifactMeta = match[2];
    const lang = match[4]?.trim() || null;
    const body = match[5] ?? '';
    if (artifactMeta) {
      blocks.push(buildArtifact(artifactMeta, lang, body));
    } else {
      blocks.push({ kind: 'code', language: lang, code: body });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < markdown.length) {
    pushTextWithMath(blocks, markdown.slice(lastIndex));
  }
  return blocks.filter((b) => !(b.kind === 'text' && b.markdown.trim() === ''));
}

function buildArtifact(metaAttrs: string, lang: string | null, content: string): Block {
  const get = (k: string): string | null => {
    const re = new RegExp(`${k}="((?:\\\\.|[^"])*)"`);
    const m = metaAttrs.match(re);
    return m && m[1] ? m[1].replace(/\\"/g, '"') : null;
  };
  return {
    kind: 'artifact',
    identifier: get('identifier') || null,
    title: get('title') || null,
    language: lang,
    mimeType: get('mime') || null,
    content,
  };
}

function pushTextWithMath(blocks: Block[], chunk: string): void {
  const tex = /\$([^$\n]{1,400})\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let foundAny = false;
  while ((match = tex.exec(chunk)) !== null) {
    foundAny = true;
    if (match.index > lastIndex) {
      blocks.push({ kind: 'text', markdown: chunk.slice(lastIndex, match.index) });
    }
    blocks.push({ kind: 'math', tex: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (!foundAny) {
    blocks.push({ kind: 'text', markdown: chunk });
    return;
  }
  if (lastIndex < chunk.length) {
    blocks.push({ kind: 'text', markdown: chunk.slice(lastIndex) });
  }
}

function makeNonce(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
