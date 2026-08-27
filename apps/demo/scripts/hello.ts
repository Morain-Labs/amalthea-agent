/**
 * Hello-agent: one end-to-end turn against the configured Gemini model,
 * locally via the Gemini API key in the repo-root .env.local. Retries on
 * transient errors (the free tier throws 503 under load) and falls back to
 * FALLBACK_MODEL on the last attempt, per the documented model ruling.
 *
 *   npm run hello --workspace @amalthea/demo
 */
import { InMemoryRunner, getFunctionCalls, isFinalResponse } from '@google/adk';
import { buildAgent } from '../src/agent/agent';
import { FALLBACK_MODEL, modelId } from '../src/agent/model';
import { loadRootEnv } from '../src/lib/env';

loadRootEnv();

if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_GENAI_USE_VERTEXAI !== 'true') {
  console.error(
    'No GEMINI_API_KEY found. Copy env.example to .env.local at the repo root and set it.',
  );
  process.exit(1);
}

interface TurnResult {
  finalText: string;
  toolCalled: boolean;
  error?: string;
}

async function runTurn(model: string): Promise<TurnResult> {
  const runner = new InMemoryRunner({ agent: buildAgent(model), appName: 'amalthea-demo' });
  const result: TurnResult = { finalText: '', toolCalled: false };
  for await (const event of runner.runEphemeral({
    userId: 'local-dev',
    newMessage: {
      role: 'user',
      parts: [{ text: 'Verify connectivity, then say hello in one sentence.' }],
    },
  })) {
    if (getFunctionCalls(event).length > 0) {
      result.toolCalled = true;
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

let outcome: TurnResult = { finalText: '', toolCalled: false };
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
console.log(`tool called: ${outcome.toolCalled}`);
console.log(`final: ${outcome.finalText}`);

if (!outcome.finalText) {
  console.error('FAIL: no final response after retries and fallback.');
  process.exit(1);
}
if (!outcome.toolCalled) {
  console.error('FAIL: the ping tool was never called.');
  process.exit(1);
}
console.log('PASS: end-to-end agent turn with tool call.');
