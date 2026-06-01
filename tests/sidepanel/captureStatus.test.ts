import { describe, it, expect } from 'vitest';
import {
  captureStatusText,
  platformLabel,
} from '../../src/sidepanel/components/CaptureStatus.helpers';

describe('platformLabel', () => {
  it('returns the user-facing brand name for each platform', () => {
    expect(platformLabel('chatgpt')).toBe('ChatGPT');
    expect(platformLabel('claude')).toBe('Claude');
    expect(platformLabel('gemini')).toBe('Gemini');
  });
});

describe('captureStatusText', () => {
  it('prefers the conversation title when available', () => {
    expect(
      captureStatusText({
        platform: 'claude',
        title: 'Explain monads',
        messageCount: 4,
      })
    ).toBe('Captured from Claude · Explain monads');
  });

  it('falls back to a message count when no title is present', () => {
    expect(
      captureStatusText({ platform: 'chatgpt', messageCount: 38 })
    ).toBe('Captured from ChatGPT · 38 messages');
  });

  it('falls back to a message count when the title is blank/whitespace', () => {
    expect(
      captureStatusText({ platform: 'gemini', title: '   ', messageCount: 1 })
    ).toBe('Captured from Gemini · 1 message');
  });

  it('singularizes the message count when there is exactly one', () => {
    expect(
      captureStatusText({ platform: 'claude', messageCount: 1 })
    ).toBe('Captured from Claude · 1 message');
  });

  it('truncates very long titles with an ellipsis to stay readable in the narrow panel', () => {
    const longTitle = 'A'.repeat(80);
    const text = captureStatusText({
      platform: 'claude',
      title: longTitle,
      messageCount: 4,
    });
    expect(text.length).toBeLessThanOrEqual('Captured from Claude · '.length + 40);
    expect(text.endsWith('…')).toBe(true);
  });

  it('never surfaces internal platform identifiers', () => {
    const text = captureStatusText({
      platform: 'chatgpt',
      messageCount: 5,
    });
    expect(text).toContain('ChatGPT');
    expect(text).not.toContain('chatgpt');
  });
});
