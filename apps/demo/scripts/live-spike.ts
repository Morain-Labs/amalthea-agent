/**
 * Live spike: can ADK-JS run a Gemini Live (bidirectional) session? Opens a
 * live session in TEXT modality against the live-capable model, sends one
 * message through the LiveRequestQueue, and reports what comes back. TEXT
 * keeps the spike free of audio plumbing. The audio path uses the same
 * runLive entry point with AUDIO modality plus a speechConfig.
 *
 * Known limit, verified 2026-08-26: the Live endpoint rejects free-tier AI
 * Studio keys (close 1007, "API key not valid") on every live model, while
 * the same key passes generateContent. Expect this to pass only with an
 * entitled key or on the Vertex backend (GOOGLE_GENAI_USE_VERTEXAI=true with
 * ADC). ADK surfaces that rejection as a silent hang, hence the watchdog.
 *
 *   npm run live-spike --workspace @amalthea/demo
 */
import { InMemoryRunner, LiveRequestQueue } from '@google/adk';
import { Modality } from '@google/genai';
import { buildAgent } from '../src/agent/agent';
import { liveModelId } from '../src/agent/model';
import { loadRootEnv } from '../src/lib/env';

loadRootEnv();

if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
  console.error(
    'No GEMINI_API_KEY found. Copy env.example to .env.local at the repo root and set it.',
  );
  process.exit(1);
}

const APP = 'amalthea-live-spike';
const model = liveModelId();
console.log(`live model: ${model}`);

const runner = new InMemoryRunner({ agent: buildAgent(model), appName: APP });
const session = await runner.sessionService.createSession({
  appName: APP,
  userId: 'local-dev',
});

const queue = new LiveRequestQueue();
const watchdog = setTimeout(() => {
  console.error('LIVE SPIKE: NO (timed out after 60s with no reply)');
  process.exit(2);
}, 60_000);

queue.sendContent({
  role: 'user',
  parts: [{ text: 'Reply with one short greeting sentence.' }],
});
// Per the SDK's own runLive tests: closing the queue marks end of input and
// lets the generator finish naturally after the model's reply.
queue.close();

let received = '';
try {
  for await (const event of runner.runLive({
    userId: 'local-dev',
    sessionId: session.id,
    liveRequestQueue: queue,
    runConfig: { responseModalities: [Modality.TEXT] },
  })) {
    if (event.errorMessage) {
      console.error(`error event: ${event.errorCode ?? '?'} ${event.errorMessage}`);
      break;
    }
    const text = (event.content?.parts ?? []).map((part) => part.text ?? '').join('');
    if (text) received += text;
    if (event.turnComplete) break;
  }
} finally {
  queue.close();
  clearTimeout(watchdog);
}

console.log(`live reply: ${received.trim()}`);
if (received.trim()) {
  console.log('LIVE SPIKE: YES (bidirectional live session over ADK-JS runLive)');
  process.exit(0);
}
console.error('LIVE SPIKE: NO (session opened but no text came back)');
process.exit(1);
