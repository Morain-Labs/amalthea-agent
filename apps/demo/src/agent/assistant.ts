import {
  buildSystemInstruction,
  createTools,
  type DataPort,
} from '@amalthea/assistant-core';
import { FunctionTool, LlmAgent } from '@google/adk';
import { modelId } from './model';

/**
 * Assembles the live assistant: the brain's tools pressed through the given
 * port, under an instruction rebuilt from current household state so the
 * interview status, preferences, and saved adjustments are always fresh.
 */
export async function buildAssistantAgent(input: {
  port: DataPort;
  model?: string;
}): Promise<LlmAgent> {
  const { port } = input;
  const [household, preferences, adjustments] = await Promise.all([
    port.getHousehold(),
    port.getPreferences(),
    port.listAdjustments(),
  ]);

  const tools = createTools(port).map(
    (tool) =>
      new FunctionTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: (args) => tool.execute(args),
      }),
  );

  return new LlmAgent({
    name: 'amalthea',
    model: input.model ?? modelId(),
    description: 'Amalthea, a meal-planning assistant that interviews before it plans.',
    instruction: buildSystemInstruction({ household, preferences, adjustments }),
    tools,
  });
}
