import { extractFromDocument } from '../pipeline/extract';
import { register, startListening } from '../messaging/bus';
import { ExtractionError } from '../types/raw';

register('PING', () => {
  const platform = inferPlatformFromHost(location.hostname);
  return { type: 'PONG', platform };
});

register('EXTRACT_REQUEST', async () => {
  try {
    const conversation = await extractFromDocument();
    return { type: 'EXTRACT_RESULT', conversation };
  } catch (err) {
    if (err instanceof ExtractionError) {
      return { type: 'EXTRACT_ERROR', reason: err.reason, detail: err.message };
    }
    return {
      type: 'EXTRACT_ERROR',
      reason: 'unknown',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
});

startListening();

function inferPlatformFromHost(host: string) {
  if (host === 'chat.openai.com' || host === 'chatgpt.com') return 'chatgpt';
  if (host === 'claude.ai') return 'claude';
  return null;
}
