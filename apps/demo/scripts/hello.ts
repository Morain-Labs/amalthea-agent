/**
 * Hello-agent: one end-to-end turn of the REAL assistant (instruction, tools,
 * seeded household in memory, no emulator needed) against the configured
 * Gemini model, locally via the key in the repo-root .env.local. Retries on
 * transient errors and falls back to FALLBACK_MODEL on the last attempt.
 *
 *   npm run hello --workspace @amalthea/demo
 */
import { createInMemoryPort } from '@amalthea/assistant-core';
import { InMemoryRunner, getFunctionCalls, isFinalResponse } from '@google/adk';
import { buildAssistantAgent } from '../src/agent/assistant';
import { FALLBACK_MODEL, modelId } from '../src/agent/model';
import { loadRootEnv } from '../src/lib/env';
import { materializeSeed } from './seed-data';

loadRootEnv();

if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
  console.error(
    'No GEMINI_API_KEY found. Copy env.example to .env.local at the repo root and set it.',
  );
  process.exit(1);
}

interface TurnResult {
  finalText: string;
  toolsCalled: string[];
  error?: string;
}

async function runTurn(model: string): Promise<TurnResult> {
  const seed = materializeSeed();
  const port = createInMemoryPort(seed);
  const agent = await buildAssistantAgent({ port, model });
  const runner = new InMemoryRunner({ agent, appName: 'amalthea-hello' });
  const result: TurnResult = { finalText: '', toolsCalled: [] };

  for await (const event of runner.runEphemeral({
    userId: 'local-dev',
    newMessage: {
      role: 'user',
      parts: [{ text: 'What in the pantry expires soonest? One short sentence.' }],
    },
  })) {
    for (const call of getFunctionCalls(event)) {
      result.toolsCalled.push(call.name ?? 'unknown');
    }
    if (event.errorMessage) {
      result.error = `${event.errorCode ?? 'error'}: ${event.errorMessage}`;
    }
    if (isFinalResponse(event) && event.content) {
      const text = (event.content.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (text) result.finalText = text;
    }
  }
  return result;
}

const attempts = [
  { model: modelId(), waitMs: 0 },
  { model: modelId(), waitMs: 4000 },
  { model: FALLBACK_MODEL, waitMs: 2000 },
];

let outcome: TurnResult = { finalText: '', toolsCalled: [] };
let usedModel = '';

for (const attempt of attempts) {
  if (attempt.waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, attempt.waitMs));
  }
  console.log(`attempt: ${attempt.model}`);
  outcome = await runTurn(attempt.model);
  usedModel = attempt.model;
  if (outcome.finalText) break;
  console.error(`  no final text${outcome.error ? ` (${outcome.error})` : ''}, retrying`);
}

console.log(`model that answered: ${usedModel}`);
console.log(`tools called: ${outcome.toolsCalled.join(', ') || 'none'}`);
console.log(`final: ${outcome.finalText}`);

if (!outcome.finalText) {
  console.error('FAIL: no final response after retries and fallback.');
  process.exit(1);
}
if (!outcome.toolsCalled.includes('get_pantry')) {
  console.error('FAIL: the assistant never pressed get_pantry.');
  process.exit(1);
}
console.log('PASS: end-to-end assistant turn with real tools.');
