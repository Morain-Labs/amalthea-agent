import { FunctionTool, LlmAgent } from '@google/adk';
import { z } from 'zod';
import { modelId } from './model';

/**
 * Connectivity probe kept while the real tools layer lands: it proves the
 * model can call tools end to end on this stack.
 */
const ping = new FunctionTool({
  name: 'ping',
  description: 'Connectivity check. Returns status ok when the stack works.',
  parameters: z.object({}),
  execute: () => ({ status: 'ok' }),
});

export function buildAgent(model: string = modelId()): LlmAgent {
  return new LlmAgent({
    name: 'amalthea',
    model,
    description:
      'Amalthea, a meal-planning assistant that interviews before it plans.',
    instruction:
      'You are Amalthea, a meal-planning assistant. You ask clarifying ' +
      'questions before proposing anything. When asked to verify ' +
      'connectivity, call the ping tool and report its status in one short ' +
      'sentence.',
    tools: [ping],
  });
}
