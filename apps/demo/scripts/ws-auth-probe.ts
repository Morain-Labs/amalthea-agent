/**
 * Diagnostic: connect the Live WebSocket by hand, trying each way of
 * presenting the credential. The new AI Studio auth keys (AQ.* prefix) may
 * not be accepted as a ?key= query param the way legacy AIza keys were.
 */
import WebSocket from 'ws';
import { loadRootEnv } from '../src/lib/env';

loadRootEnv();

const KEY = process.env.GEMINI_API_KEY ?? '';
const MODEL = process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview';
const HOST = 'wss://generativelanguage.googleapis.com';
const PATH_V1BETA = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const PATH_V1ALPHA = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

interface Attempt {
  label: string;
  url: string;
  headers?: Record<string, string>;
}

const attempts: Attempt[] = [
  { label: 'v1beta ?key=', url: `${HOST}${PATH_V1BETA}?key=${KEY}` },
  {
    label: 'v1beta x-goog-api-key header',
    url: `${HOST}${PATH_V1BETA}`,
    headers: { 'x-goog-api-key': KEY },
  },
  {
    label: 'v1beta Authorization Bearer',
    url: `${HOST}${PATH_V1BETA}`,
    headers: { Authorization: `Bearer ${KEY}` },
  },
  { label: 'v1alpha ?key=', url: `${HOST}${PATH_V1ALPHA}?key=${KEY}` },
  {
    label: 'v1alpha x-goog-api-key header',
    url: `${HOST}${PATH_V1ALPHA}`,
    headers: { 'x-goog-api-key': KEY },
  },
];

function tryOne(attempt: Attempt): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (verdict: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      resolve(verdict);
    };

    const socket = new WebSocket(attempt.url, { headers: attempt.headers });
    const timer = setTimeout(() => done('TIMEOUT (no reply in 20s)'), 20_000);

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          setup: { model: `models/${MODEL}`, generationConfig: { responseModalities: ['TEXT'] } },
        }),
      );
    });
    socket.on('message', (data: Buffer) => {
      clearTimeout(timer);
      const text = data.toString('utf8').slice(0, 120);
      done(`ACCEPTED, server replied: ${text}`);
    });
    socket.on('close', (code: number, reason: Buffer) => {
      clearTimeout(timer);
      done(`closed ${code}: ${reason.toString('utf8').slice(0, 110)}`);
    });
    socket.on('error', (error: Error) => {
      clearTimeout(timer);
      done(`error: ${error.message.slice(0, 110)}`);
    });
  });
}

console.log(`key prefix: ${KEY.slice(0, 6)}, model: ${MODEL}\n`);
for (const attempt of attempts) {
  const verdict = await tryOne(attempt);
  console.log(`${attempt.label}\n  -> ${verdict}\n`);
}
process.exit(0);
