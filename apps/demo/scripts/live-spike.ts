/**
 * Live spike: can ADK-JS run a Gemini Live (bidirectional) session? Opens a
 * live session against the live-capable model, sends one message through the
 * LiveRequestQueue, and reports what comes back.
 *
 * Modality note, learned the hard way: gemini-3.1-flash-live-preview does
 * NOT support TEXT output. It is a speech model and only returns AUDIO.
 * Asking for TEXT closes the socket with 1007. So the spike asks for AUDIO
 * and turns on output transcription to get readable proof of what was said.
 *
 * Credential note, verified 2026-08-27: Live needs a billing-enabled AI
 * Studio key. A free-tier key is rejected with close 1007 ("API key not
 * valid") even though that same key works fine for generateContent, so the
 * error is misleading. ADK surfaces the rejection as a silent hang, hence
 * the watchdog. Vertex is a separate story: the Live models are not served
 * to this project there, so Live runs on the AI Studio key.
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
// Do NOT close the queue here. Closing it right after sending ends the
// session before the model streams its audio back, which looks exactly like
// a hang. Close it once the turn completes instead.

let transcript = '';
let audioBytes = 0;
try {
  for await (const event of runner.runLive({
    userId: 'local-dev',
    sessionId: session.id,
    liveRequestQueue: queue,
    runConfig: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
    },
  })) {
    if (event.errorMessage) {
      console.error(`error event: ${event.errorCode ?? '?'} ${event.errorMessage}`);
      break;
    }
    for (const part of event.content?.parts ?? []) {
      if (part.inlineData?.data) {
        audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
      }
    }
    if (event.outputTranscription?.text) transcript += event.outputTranscription.text;
    if (event.turnComplete) break;
  }
} finally {
  queue.close();
  clearTimeout(watchdog);
}

console.log(`spoken transcript: ${transcript.trim()}`);
console.log(`audio received: ${audioBytes} bytes`);
if (audioBytes > 0) {
  console.log('LIVE SPIKE: YES (bidirectional live audio session over ADK-JS runLive)');
  process.exit(0);
}
console.error('LIVE SPIKE: NO (session opened but no audio came back)');
process.exit(1);
