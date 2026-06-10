import type { Conversation, Message } from '../types/conversation';
import type { HtmlTemplate } from '../export/html';

/**
 * Long-image share card renderer.
 *
 * Draws the whole conversation to a single tall PNG using a 2D canvas — no
 * dependencies, no network. The text-layout math (wrapLine / layout) is kept
 * pure and unit-tested by injecting a `measure` function; the canvas drawing
 * is the thin UI shell on top. Lives in the fullview UI layer because it needs
 * the DOM (canvas), not the framework-agnostic pipeline.
 */

const WIDTH = 720;
const PAD = 32;
const CONTENT_WIDTH = WIDTH - PAD * 2;
const LINE_H = 22;
const ROLE_H = 20;
const MSG_GAP = 22;
const MSG_PAD = 16;
const HEADER_H = 92;
const BODY_FONT = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const ROLE_FONT = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TITLE_FONT = '650 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const META_FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

interface Palette {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  meta: string;
  accent: string;
}

const PALETTES: Record<HtmlTemplate, Palette> = {
  highlight: { bg: '#fafaf9', card: '#ffffff', cardBorder: '#e7e5e4', text: '#1c1917', meta: '#78716c', accent: '#ea580c' },
  dark: { bg: '#0a0a0a', card: '#141414', cardBorder: '#262626', text: '#e5e5e5', meta: '#737373', accent: '#60a5fa' },
  note: { bg: '#fffdf7', card: '#ffffff', cardBorder: '#e9dcc3', text: '#3a3226', meta: '#8a7a5c', accent: '#a16207' },
};

export type Measure = (text: string) => number;

/**
 * Greedy word-wrap. Words longer than maxWidth are hard-broken character by
 * character so nothing overflows. Pure: `measure` reports the pixel width of a
 * string, so this is testable without a real canvas.
 */
export function wrapLine(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  let current = '';

  const pushChunked = (word: string): void => {
    let chunk = '';
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (measure(word) > maxWidth) {
      pushChunked(word);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export interface LaidOutMessage {
  role: string;
  lines: string[];
  /** Pixel height of this message card. */
  height: number;
}

/**
 * Wrap every message body and compute card heights. Returns the laid-out
 * messages plus the total document height, so the caller can size the canvas
 * before drawing. Pure given `measure`.
 */
export function layout(messages: Message[], measure: Measure): { items: LaidOutMessage[]; totalHeight: number } {
  const items: LaidOutMessage[] = [];
  let y = HEADER_H;
  for (const m of messages) {
    const paragraphs = m.content.split('\n');
    const lines: string[] = [];
    for (const p of paragraphs) {
      if (p.trim() === '') {
        lines.push('');
        continue;
      }
      lines.push(...wrapLine(p, CONTENT_WIDTH - MSG_PAD * 2, measure));
    }
    const height = MSG_PAD * 2 + ROLE_H + lines.length * LINE_H;
    items.push({ role: m.role, lines, height });
    y += height + MSG_GAP;
  }
  return { items, totalHeight: y + PAD };
}

export interface ShareImageOptions {
  template?: HtmlTemplate;
}

/**
 * Render the conversation to a PNG Blob. Returns null if a 2D context can't be
 * obtained (e.g. a headless environment without canvas support).
 */
export async function renderShareImage(
  conv: Conversation,
  options: ShareImageOptions = {}
): Promise<Blob | null> {
  const palette = PALETTES[options.template ?? 'highlight'];
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.font = BODY_FONT;
  const measure: Measure = (t) => probe.measureText(t).width;

  const { items, totalHeight } = layout(conv.messages, measure);

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * dpr;
  canvas.height = totalHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'top';

  // background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  // header
  ctx.fillStyle = palette.text;
  ctx.font = TITLE_FONT;
  ctx.fillText(truncateToWidth(conv.source.title ?? 'Conversation', CONTENT_WIDTH, ctx), PAD, PAD);
  ctx.fillStyle = palette.meta;
  ctx.font = META_FONT;
  const metaParts = [displayPlatform(conv.source.platform)];
  if (conv.source.model) metaParts.push(conv.source.model);
  metaParts.push(`${conv.stats.messageCount} messages`);
  ctx.fillText(metaParts.join('  ·  '), PAD, PAD + 36);

  // messages
  let y = HEADER_H;
  for (const item of items) {
    roundRect(ctx, PAD, y, CONTENT_WIDTH, item.height, 12);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.strokeStyle = palette.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    ctx.font = ROLE_FONT;
    ctx.fillText(roleLabel(item.role).toUpperCase(), PAD + MSG_PAD, y + MSG_PAD);

    ctx.fillStyle = palette.text;
    ctx.font = BODY_FONT;
    let ly = y + MSG_PAD + ROLE_H;
    for (const line of item.lines) {
      if (line) ctx.fillText(line, PAD + MSG_PAD, ly);
      ly += LINE_H;
    }
    y += item.height + MSG_GAP;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateToWidth(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool':
      return 'Tool';
    default:
      return role;
  }
}

function displayPlatform(p: string): string {
  switch (p) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'claude':
      return 'Claude';
    case 'gemini':
      return 'Gemini';
    default:
      return p;
  }
}
