/**
 * Diagnostic: connect to the Gemini Live API directly through @google/genai,
 * bypassing ADK, to isolate whether Live works for this key + model at all.
 */
import { GoogleGenAI, Modality } from '@google/genai';
import { liveModelId } from '../src/agent/model';
import { loadRootEnv } from '../src/lib/env';

loadRootEnv();

const model = liveModelId();
console.log(`raw live probe, model: ${model}`);

const useVertex =
  process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' ||
  process.env.GOOGLE_GENAI_USE_ENTERPRISE === 'true';
const apiVersion = process.env.GEMINI_LIVE_API_VERSION ?? 'v1alpha';
console.log(useVertex ? 'backend: vertex' : `backend: api key, apiVersion ${apiVersion}`);
const ai = useVertex
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    })
  : new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion },
    });

const watchdog = setTimeout(() => {
  console.error('RAW LIVE: TIMEOUT after 45s');
  process.exit(2);
}, 45_000);

let received = '';

const session = await ai.live.connect({
  model,
  config: { responseModalities: [Modality.TEXT] },
  callbacks: {
    onopen: () => console.log('onopen: connection established'),
    onmessage: (message) => {
      const parts = message.serverContent?.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.text) received += part.text;
      }
      if (message.serverContent?.turnComplete) {
        console.log(`reply: ${received.trim()}`);
        console.log(received.trim() ? 'RAW LIVE: YES' : 'RAW LIVE: NO (empty reply)');
        clearTimeout(watchdog);
        session.close();
        process.exit(received.trim() ? 0 : 1);
      }
    },
    onerror: (error) => {
      console.error(`onerror: ${error.message}`);
      clearTimeout(watchdog);
      process.exit(1);
    },
    onclose: (event) => {
      console.error(`onclose: code=${event.code} reason=${event.reason}`);
    },
  },
});

session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: 'Reply with one short greeting sentence.' }] }],
  turnComplete: true,
});
