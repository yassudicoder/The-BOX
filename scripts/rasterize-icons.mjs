// Generate icon{16,32,48,128}.png from a single high-res source image.
//
// The source is the composite PNG the designer dropped at the repo root.
// We auto-detect the dark APP ICON square in the upper half, crop it
// (with a tiny safety inset to drop any anti-aliased seam), then resample
// to each manifest size with Lanczos3 — the standard high-quality
// PNG→PNG resample. Each target size gets its own resize call from the
// cropped source so the resampler runs at the right ratio.
//
// Run: node scripts/rasterize-icons.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SIZES = [16, 32, 48, 128];
const OUT_DIR = join(root, 'public', 'icons');

// Find the composite source PNG the designer dropped at repo root.
const candidates = readdirSync(root).filter(
  (f) => f.toLowerCase().endsWith('.png') && f.toLowerCase().startsWith('chatgpt image')
);
if (candidates.length === 0) {
  throw new Error('No source PNG found at repo root (expected a "ChatGPT Image …" file).');
}
const SRC = join(root, candidates[0]);
console.log(`source: ${candidates[0]}`);

// Load raw RGB pixels to detect the dark icon bounding box.
const meta = await sharp(SRC).metadata();
const { width: W, height: H } = meta;
const raw = await sharp(SRC).removeAlpha().raw().toBuffer();
// raw is RGB, row-major, length = W * H * 3.

// A pixel is "dark" if all RGB are below this threshold. The icon's
// near-black navy is well under; the white page background is well above.
const DARK = 60;
const isDark = (x, y) => {
  const i = (y * W + x) * 3;
  return raw[i] < DARK && raw[i + 1] < DARK && raw[i + 2] < DARK;
};

// Scan only the UPPER HALF so we don't pick up the banner section below.
const UPPER_H = Math.floor(H / 2);

// Find topmost row with a substantial dark run — the icon's top edge.
let top = -1;
for (let y = 0; y < UPPER_H; y++) {
  let darkInRow = 0;
  for (let x = 0; x < W; x++) if (isDark(x, y)) darkInRow++;
  if (darkInRow > W * 0.10) {
    top = y;
    break;
  }
}
if (top < 0) throw new Error('Could not find icon top edge in upper half.');

// Find the bottom of that contiguous dark region (within upper half).
let bottom = top;
for (let y = top; y < UPPER_H; y++) {
  let darkInRow = 0;
  for (let x = 0; x < W; x++) if (isDark(x, y)) darkInRow++;
  if (darkInRow > W * 0.10) bottom = y;
}

// Find left/right by scanning columns within [top, bottom].
let left = W, right = 0;
for (let y = top; y <= bottom; y++) {
  for (let x = 0; x < W; x++) {
    if (isDark(x, y)) {
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
}

// Tiny inset (0.5%) to avoid bleeding the AA edge into the crop.
const inset = Math.round(Math.min(right - left, bottom - top) * 0.005);
const cropL = Math.max(0, left + inset);
const cropT = Math.max(0, top + inset);
const cropR = Math.min(W - 1, right - inset);
const cropB = Math.min(H - 1, bottom - inset);
const cropW = cropR - cropL + 1;
const cropH = cropB - cropT + 1;
console.log(`detected icon bbox: x=${cropL} y=${cropT} w=${cropW} h=${cropH}`);

// Force a square crop centered on the detected bbox — the icon is square.
const side = Math.min(cropW, cropH);
const cx = cropL + Math.floor(cropW / 2);
const cy = cropT + Math.floor(cropH / 2);
const sqL = Math.max(0, Math.min(W - side, cx - Math.floor(side / 2)));
const sqT = Math.max(0, Math.min(H - side, cy - Math.floor(side / 2)));
console.log(`square crop: x=${sqL} y=${sqT} side=${side}`);

// Buffer the square crop once, then resample to each target size from it.
const cropped = await sharp(SRC)
  .extract({ left: sqL, top: sqT, width: side, height: side })
  .png()
  .toBuffer();

for (const size of SIZES) {
  const out = join(OUT_DIR, `icon${size}.png`);
  await sharp(cropped)
    .resize(size, size, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);
  const bytes = readFileSync(out).length;
  console.log(`wrote public/icons/icon${size}.png (${bytes} B)`);
}
