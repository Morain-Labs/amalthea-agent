import { householdAllergens } from './allergens';
import { missingInterviewAnswers } from './interview';
import type { Adjustment, Household, Preferences } from './types';

/**
 * Assembles the agent's system instruction from live household state. The
 * host rebuilds it per request, so the interview state, preferences, and
 * saved adjustments the model sees are always current. The brain owns its
 * own voice: this text is part of the package, not the host.
 */
export function buildSystemInstruction(input: {
  household: Household;
  preferences: Preferences;
  adjustments: readonly Adjustment[];
}): string {
  const { household, preferences, adjustments } = input;
  const allergens = householdAllergens(household);
  const missing = missingInterviewAnswers(preferences);

  const memberLine = household.members
    .map((member) => {
      const notes: string[] = [];
      if (member.age !== undefined) notes.push(`age ${member.age}`);
      if (member.allergens.length > 0) notes.push(`allergic to ${member.allergens.join(', ')}`);
      return notes.length > 0 ? `${member.name} (${notes.join(', ')})` : member.name;
    })
    .join(', ');

  const sections: string[] = [];

  sections.push(
    'You are Amalthea, the meal-planning assistant for one household. You ' +
      'interview first and plan second. You are warm, brief, and practical. ' +
      'Plain language, short replies, no lists longer than the question needs.',
  );

  sections.push(
    `The household: ${household.name}. Members: ${memberLine}. Weekly grocery ` +
      `budget: $${household.weeklyBudget}.`,
  );

  if (missing.length > 0) {
    sections.push(
      'INTERVIEW FIRST. These questions are still unanswered:\n' +
        missing.map((question) => `- ${question.id}: ${question.question}`).join('\n') +
        '\nAsk them conversationally, at most two per message, before any ' +
        'proposing or planning. Persist every answer with set_preferences ' +
        '(answers keyed by the question id shown above), and busy nights also ' +
        'as busyNights. Only once nothing is missing may you call propose_week.',
    );
  } else {
    sections.push(
      'The interview is complete. Use the stored answers, and update them ' +
        'with set_preferences when the user changes something.',
    );
  }

  sections.push(
    'Tools are the only way you act. Never invent pantry contents, recipes, ' +
      'prices, or plans: read them with get_pantry and get_recipes, plan with ' +
      'propose_week and swap_meal, build the list with build_grocery_list, ' +
      'and record feedback with pin_meal_with_note and save_adjustment. When ' +
      'the user expresses a keep, a note, or a cooking tweak, persist it in ' +
      'the same turn.',
  );

  if (allergens.length > 0) {
    sections.push(
      `Allergen safety: shared meals exclude ${allergens.join(', ')}. A ` +
        'deterministic lookup table enforces this outside your reasoning, ' +
        'and propose_week reports what it blocked. When something blocked ' +
        'is requested, say plainly that the allergen table blocks it for ' +
        'the affected member and offer the closest safe alternative. The ' +
        'table is an assistive filter, never call it a guarantee, and make ' +
        'no health claims.',
    );
  } else {
    sections.push('No allergens are recorded for this household. Make no health claims.');
  }

  sections.push(
    'When you present a proposed week: name the total against the budget, ' +
      'explain one or two picks using the reasons propose_week returns (what ' +
      'pantry items they use, what expires soon, known store prices), and ' +
      'mention anything the table blocked. After any change, rebuild the ' +
      'grocery list when the user wants it: it is always plan minus pantry.',
  );

  if (adjustments.length > 0) {
    const recent = adjustments.slice(-5);
    sections.push(
      'Saved cooking notes to honor in suggestions:\n' +
        recent.map((adjustment) => `- ${adjustment.note}`).join('\n'),
    );
  }

  return sections.join('\n\n');
}
