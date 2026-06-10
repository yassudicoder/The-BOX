import { jsPDF } from 'jspdf';
import type { Block, Conversation, Message, Role } from '../types/conversation';

/**
 * Full-conversation PDF export.
 *
 * Renders every message across as many pages as needed using jsPDF's own text
 * measurement + pagination — no print dialog, no DOM, no network. Pure enough
 * to unit-test: buildPdf() returns the jsPDF document so tests can assert page
 * count and content; exportPdf() wraps it as bytes for download.
 *
 * jsPDF is the one bundled dependency this feature justifies: a reliable
 * one-click PDF of the whole conversation, which the browser-print path could
 * not guarantee (popup blockers, dialog cancellation, image timing).
 */

export interface PdfExportOptions {
  /** Document title; defaults to the conversation title. */
  title?: string;
}

// Geometry, in millimetres (jsPDF default unit for the 'a4' format).
const PAGE = { w: 210, h: 297 };
const MARGIN = { top: 18, bottom: 18, left: 16, right: 16 };
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;
const BODY_SIZE = 10;
const CODE_SIZE = 9;
const LINE_H = 5; // body line height
const CODE_LINE_H = 4.4;
const ACCENT: [number, number, number] = [234, 88, 12]; // orange-600
const INK: [number, number, number] = [28, 25, 23];
const MUTED: [number, number, number] = [120, 113, 108];
const CODE_BG: [number, number, number] = [244, 244, 245];

interface Cursor {
  y: number;
}

export function buildPdf(conv: Conversation, options: PdfExportOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cursor: Cursor = { y: MARGIN.top };

  drawHeader(doc, conv, options.title ?? conv.source.title ?? 'Conversation', cursor);
  for (const m of conv.messages) {
    drawMessage(doc, m, cursor);
  }
  drawFooters(doc);
  return doc;
}

/** Render the whole conversation to PDF bytes (ArrayBuffer). */
export function exportPdf(conv: Conversation, options: PdfExportOptions = {}): ArrayBuffer {
  return buildPdf(conv, options).output('arraybuffer');
}

function drawHeader(doc: jsPDF, conv: Conversation, title: string, cursor: Cursor): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setColor(doc, INK);
  for (const line of doc.splitTextToSize(title, CONTENT_W)) {
    ensureSpace(doc, cursor, 8);
    doc.text(line, MARGIN.left, cursor.y);
    cursor.y += 8;
  }

  const s = conv.source;
  const meta: string[] = [`Source: ${displayPlatform(s.platform)}`];
  if (s.model) meta.push(`Model: ${s.model}`);
  meta.push(`Captured: ${formatTimestamp(s.capturedAt)}`);
  meta.push(`${conv.stats.messageCount} messages · ~${conv.stats.approxTokens.toLocaleString()} tokens`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(doc, MUTED);
  for (const line of doc.splitTextToSize(meta.join('   ·   '), CONTENT_W)) {
    ensureSpace(doc, cursor, 5);
    doc.text(line, MARGIN.left, cursor.y);
    cursor.y += 5;
  }
  if (conv.stats.truncated) {
    ensureSpace(doc, cursor, 5);
    doc.text('This capture may be incomplete (source view was truncated).', MARGIN.left, cursor.y);
    cursor.y += 5;
  }
  cursor.y += 3;
  divider(doc, cursor);
}

function drawMessage(doc: jsPDF, m: Message, cursor: Cursor): void {
  cursor.y += 3;
  // Role label (+ optional timestamp), kept with at least the first body line.
  ensureSpace(doc, cursor, LINE_H * 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(doc, ACCENT);
  doc.text(roleLabel(m.role).toUpperCase(), MARGIN.left, cursor.y);
  if (m.createdAt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, MUTED);
    doc.text(formatTimestamp(m.createdAt), PAGE.w - MARGIN.right, cursor.y, { align: 'right' });
  }
  cursor.y += LINE_H + 1;

  const blocks = m.blocks.length > 0 ? m.blocks : ([{ kind: 'text', markdown: m.content }] as Block[]);
  for (const b of blocks) {
    drawBlock(doc, b, cursor);
  }
}

function drawBlock(doc: jsPDF, b: Block, cursor: Cursor): void {
  switch (b.kind) {
    case 'text':
      drawBodyText(doc, b.markdown, cursor);
      return;
    case 'code':
      drawCode(doc, b.code, b.language, cursor);
      return;
    case 'artifact':
      drawBodyText(doc, `[Artifact${b.title ? `: ${b.title}` : ''}]`, cursor, MUTED);
      drawCode(doc, b.content, b.language, cursor);
      return;
    case 'math':
      drawCode(doc, b.tex, 'math', cursor);
      return;
    case 'image':
      drawBodyText(doc, `[Image${b.alt ? `: ${b.alt}` : ''}${b.src ? '' : ' — missing'}]`, cursor, MUTED);
      return;
    case 'tool_call':
      drawBodyText(doc, `[Tool call: ${b.name}]`, cursor, MUTED);
      drawCode(doc, b.payload, null, cursor);
      return;
    case 'tool_result':
      drawBodyText(doc, `[Tool result]`, cursor, MUTED);
      drawCode(doc, b.payload, null, cursor);
      return;
    default: {
      const _never: never = b;
      return _never;
    }
  }
}

function drawBodyText(doc: jsPDF, text: string, cursor: Cursor, color: [number, number, number] = INK): void {
  if (!text.trim()) return;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);
  setColor(doc, color);
  // Preserve hard newlines, wrap each paragraph to the content width.
  for (const para of text.split('\n')) {
    const lines = para.trim() === '' ? [''] : doc.splitTextToSize(para, CONTENT_W);
    for (const line of lines) {
      ensureSpace(doc, cursor, LINE_H);
      if (line) doc.text(line, MARGIN.left, cursor.y);
      cursor.y += LINE_H;
    }
  }
}

function drawCode(doc: jsPDF, code: string, lang: string | null, cursor: Cursor): void {
  doc.setFont('courier', 'normal');
  doc.setFontSize(CODE_SIZE);
  const innerW = CONTENT_W - 4;
  const lines: string[] = [];
  if (lang) lines.push(`${lang}:`);
  for (const raw of code.split('\n')) {
    const wrapped = doc.splitTextToSize(raw.length ? raw : ' ', innerW) as string[];
    lines.push(...wrapped);
  }
  for (const line of lines) {
    ensureSpace(doc, cursor, CODE_LINE_H);
    // light code background band behind the line
    setFill(doc, CODE_BG);
    doc.rect(MARGIN.left, cursor.y - CODE_LINE_H + 1.2, CONTENT_W, CODE_LINE_H, 'F');
    setColor(doc, INK);
    doc.text(line, MARGIN.left + 2, cursor.y);
    cursor.y += CODE_LINE_H;
  }
  cursor.y += 1.5;
}

function divider(doc: jsPDF, cursor: Cursor): void {
  doc.setDrawColor(225, 224, 220);
  doc.setLineWidth(0.2);
  doc.line(MARGIN.left, cursor.y, PAGE.w - MARGIN.right, cursor.y);
  cursor.y += 2;
}

function drawFooters(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(doc, MUTED);
    doc.text(
      `Continue AI · page ${i} of ${pages}`,
      PAGE.w / 2,
      PAGE.h - 8,
      { align: 'center' }
    );
  }
}

function ensureSpace(doc: jsPDF, cursor: Cursor, needed: number): void {
  if (cursor.y + needed > PAGE.h - MARGIN.bottom) {
    doc.addPage();
    cursor.y = MARGIN.top;
  }
}

function setColor(doc: jsPDF, c: [number, number, number]): void {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setFill(doc: jsPDF, c: [number, number, number]): void {
  doc.setFillColor(c[0], c[1], c[2]);
}

function roleLabel(role: Role): string {
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
