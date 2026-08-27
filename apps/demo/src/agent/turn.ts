import type { DataPort } from '@amalthea/assistant-core';
import {
  InMemorySessionService,
  Runner,
  StreamingMode,
  getFunctionCalls,
  isFinalResponse,
} from '@google/adk';
import { buildAssistantAgent } from './assistant';
import { FALLBACK_MODEL, modelId } from './model';

const APP_NAME = 'amalthea-demo';
const USER_ID = 'demo';

/** One session service per server process: chat memory for the demo. */
const sessionService = new InMemorySessionService();

export interface TurnEvent {
  type: 'tool' | 'text' | 'final' | 'status' | 'error';
  name?: string;
  delta?: string;
  text?: string;
  label?: string;
  message?: string;
}

async function ensureSession(sessionId: string): Promise<void> {
  const existing = await sessionService.getSession({
    appName: APP_NAME,
    userId: USER_ID,
    sessionId,
  });
  if (!existing) {
    await sessionService.createSession({ appName: APP_NAME, userId: USER_ID, sessionId });
  }
}

async function* runOnce(input: {
  port: DataPort;
  sessionId: string;
  message: string;
  model: string;
}): AsyncGenerator<TurnEvent> {
  const agent = await buildAssistantAgent({ port: input.port, model: input.model });
  const runner = new Runner({ appName: APP_NAME, agent, sessionService });

  let finalText = '';
  let sawError: string | undefined;

  for await (const event of runner.runAsync({
    userId: USER_ID,
    sessionId: input.sessionId,
    newMessage: { role: 'user', parts: [{ text: input.message }] },
    runConfig: { streamingMode: StreamingMode.SSE },
  })) {
    const calls = getFunctionCalls(event);
    for (const call of calls) {
      yield { type: 'tool', name: call.name };
    }
    const text = (event.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (event.partial && text) {
      yield { type: 'text', delta: text };
    }
    if (event.errorMessage) {
      sawError = `${event.errorCode ?? 'error'}: ${event.errorMessage}`;
    }
    if (isFinalResponse(event) && text) {
      finalText = text;
    }
  }

  if (finalText) {
    yield { type: 'final', text: finalText };
  } else {
    yield { type: 'error', message: sawError ?? 'The model returned nothing.' };
  }
}

/**
 * Runs one chat turn with transient-error resilience: retry once on the
 * primary model, then once on the fallback (the free tier throws 503 under
 * load, and a demo that dies on one 503 is a dead demo).
 */
export async function* runTurn(input: {
  port: DataPort;
  sessionId: string;
  message: string;
}): AsyncGenerator<TurnEvent> {
  await ensureSession(input.sessionId);

  const attempts = [modelId(), modelId(), FALLBACK_MODEL];
  for (let index = 0; index < attempts.length; index++) {
    const model = attempts[index] ?? modelId();
    if (index > 0) {
      yield { type: 'status', label: `retrying on ${model}` };
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    let failed = false;
    for await (const event of runOnce({ ...input, model })) {
      if (event.type === 'error') {
        failed = true;
        if (index === attempts.length - 1) yield event;
        break;
      }
      yield event;
    }
    if (!failed) return;
  }
}
