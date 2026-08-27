import { filterSafeRecipes, householdAllergens } from './allergens';
import type { BlockedRecipe } from './allergens';
import { DAYS } from './types';
import type { Day, Household, PlannedMeal, Preferences, Recipe, WeekPlan } from './types';

export interface WeekProposal {
  meals: PlannedMeal[];
  totalEstimatedCost: number;
  /** Recipes the hard filter excluded, with the blocking allergens named. */
  blocked: BlockedRecipe[];
}

/**
 * Honest first version of the week builder: hard allergen filter, the anchor
 * meal on its night, then a deterministic cheapest-first fill that respects
 * the weekly budget and busy nights. The scorer that weighs pantry overlap,
 * expiry, and captured feedback lands on top of this.
 */
export function proposeWeek(input: {
  household: Household;
  recipes: readonly Recipe[];
  preferences: Preferences;
  anchor?: { day: Day; tag: string };
}): WeekProposal {
  const exclusions = householdAllergens(input.household);
  const { safe, blocked } = filterSafeRecipes(input.recipes, exclusions);

  const busy = new Set(input.preferences.busyNights ?? []);
  const cookNights = DAYS.filter((day) => !busy.has(day));

  const meals: PlannedMeal[] = [];
  const used = new Set<string>();
  let total = 0;
  const budget = input.household.weeklyBudget;

  if (input.anchor && cookNights.includes(input.anchor.day)) {
    const anchorTag = input.anchor.tag;
    const anchorRecipe = [...safe]
      .filter((recipe) => recipe.tags.includes(anchorTag))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (anchorRecipe && total + anchorRecipe.estimatedCost <= budget) {
      meals.push({ day: input.anchor.day, recipeId: anchorRecipe.id });
      used.add(anchorRecipe.id);
      total += anchorRecipe.estimatedCost;
    }
  }

  const fillOrder = [...safe].sort(
    (a, b) => a.estimatedCost - b.estimatedCost || a.id.localeCompare(b.id),
  );

  for (const day of cookNights) {
    if (meals.some((meal) => meal.day === day)) continue;
    const pick = fillOrder.find(
      (recipe) => !used.has(recipe.id) && total + recipe.estimatedCost <= budget,
    );
    if (!pick) continue;
    meals.push({ day, recipeId: pick.id });
    used.add(pick.id);
    total += pick.estimatedCost;
  }

  meals.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return { meals, totalEstimatedCost: total, blocked };
}

/**
 * Swaps one night for the next-best safe recipe not already in the plan.
 * Returns null when the day has no meal or the meal is pinned: pins are the
 * user's word, the assistant does not override them.
 */
export function swapMeal(input: {
  plan: WeekPlan;
  recipes: readonly Recipe[];
  household: Household;
  day: Day;
}): WeekPlan | null {
  const current = input.plan.meals.find((meal) => meal.day === input.day);
  if (!current || current.pinned) return null;

  const exclusions = householdAllergens(input.household);
  const { safe } = filterSafeRecipes(input.recipes, exclusions);
  const inPlan = new Set(input.plan.meals.map((meal) => meal.recipeId));

  const replacement = [...safe]
    .filter((recipe) => !inPlan.has(recipe.id))
    .sort((a, b) => a.estimatedCost - b.estimatedCost || a.id.localeCompare(b.id))[0];
  if (!replacement) return null;

  return {
    ...input.plan,
    meals: input.plan.meals.map((meal) =>
      meal.day === input.day ? { day: input.day, recipeId: replacement.id } : meal,
    ),
  };
}
