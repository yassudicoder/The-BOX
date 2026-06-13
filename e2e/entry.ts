/**
 * Browser entry for the Playwright L2 tests.
 *
 * esbuild bundles this to an IIFE that the spec injects into the page, exposing
 * the REAL extraction pipeline on `window.__continueAI`. The test then calls
 * extractFromDocument against the synthetic virtualized fixture and asserts the
 * whole conversation was recovered.
 */
import { extractFromDocument } from '../src/pipeline/extract';

declare global {
  interface Window {
    __continueAI: { extractFromDocument: typeof extractFromDocument };
    __transcript: Array<{ id: string; role: string; text: string }>;
  }
}

window.__continueAI = { extractFromDocument };
