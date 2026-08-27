/**
 * Decisive Live auth test: mint an ephemeral token from the AI Studio key,
 * then connect the Live WebSocket with the TOKEN (not the raw key), on
 * v1beta. This tests the hypothesis that Live wants a different credential
 * than the raw API key that works for generateContent.
 */
import { GoogleGenAI, Modality } from '@google/genai';
import { loadRootEnv } from '../src/lib/env';

loadRootEnv();

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('No GEMINI_API_KEY on disk.');
  process.exit(1);
}

const model = process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.0-flash-live-001';
console.log(`model: ${model}`);

// Step 1: mint the ephemeral token from the raw key.
const minter = new GoogleGenAI({ apiKey: KEY, httpOptions: { apiVersion: 'v1alpha' } });
let tokenName: string;
try {
  const token = await minter.authTokens.create({
    config: { uses: 1, httpOptions: { apiVersion: 'v1alpha' } },
  });
  if (!token.name) throw new Error('token has no name');
  tokenName = token.name;
  console.log(`STEP 1 ok: minted ephemeral token (${tokenName.slice(0, 12)}...)`);
} catch (error) {
  console.error(`STEP 1 FAIL minting token: ${error instanceof Error ? error.message : error}`);
  console.error('=> the free key cannot provision Live tokens (tier/billing), not a code fix.');
  process.exit(2);
}

// Step 2: connect Live using the token as the key, on v1beta.
const live = new GoogleGenAI({ apiKey: tokenName, httpOptions: { apiVersion: 'v1beta' } });
const watchdog = setTimeout(() => {
  console.error('STEP 2 TIMEOUT after 45s');
  process.exit(3);
}, 45_000);

let received = '';
const session = await live.live.connect({
  model,
  config: { responseModalities: [Modality.TEXT] },
  callbacks: {
    onopen: () => console.log('STEP 2: socket open'),
    onmessage: (message) => {
      for (const part of message.serverContent?.modelTurn?.parts ?? []) {
        if (part.text) received += part.text;
      }
      if (message.serverContent?.turnComplete) {
        clearTimeout(watchdog);
        console.log(`reply: ${received.trim()}`);
        console.log(received.trim() ? 'LIVE VIA TOKEN: YES' : 'LIVE VIA TOKEN: NO (empty)');
        session.close();
        process.exit(received.trim() ? 0 : 1);
      }
    },
    onerror: (error) => {
      clearTimeout(watchdog);
      console.error(`STEP 2 onerror: ${error.message}`);
      process.exit(1);
    },
    onclose: (event) => console.error(`STEP 2 onclose: code=${event.code} reason=${event.reason}`),
  },
});

session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: 'Reply with one short greeting.' }] }],
  turnComplete: true,
});
