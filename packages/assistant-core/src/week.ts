import { filterSafeRecipes, householdAllergens } from './allergens';
import type { BlockedRecipe } from './allergens';
import { normalizeIngredientName } from './ingredients';
import { DAYS } from './types';
import type {
  Day,
  Household,
  InventoryItem,
  PlannedMeal,
  Preferences,
  Recipe,
  WeekPlan,
} from './types';

export interface ProposedMeal extends PlannedMeal {
  /** Deterministic, data-backed reasons the assistant can voice. */
  reasons: string[];
}

export interface WeekProposal {
  meals: ProposedMeal[];
  totalEstimatedCost: number;
  /** Recipes the hard filter excluded, with the blocking allergens named. */
  blocked: BlockedRecipe[];
}

const EXPIRING_SOON_DAYS = 5;

interface RecipeScore {
  recipe: Recipe;
  overlapItems: string[];
  expiringItems: string[];
  score: number;
}

function scoreRecipes(
  recipes: readonly Recipe[],
  inventory: readonly InventoryItem[],
  nowIso: string,
): Map<string, RecipeScore> {
  const now = new Date(nowIso).getTime();
  const stockNames = new Map<string, { name: string; expiresInDays?: number }>();
  for (const item of inventory) {
    const key = normalizeIngredientName(item.name);
    let expiresInDays: number | undefined;
    if (item.purchasedAt && item.shelfLifeDays !== undefined) {
      const expiry = new Date(item.purchasedAt).getTime() + item.shelfLifeDays * 86_400_000;
      expiresInDays = Math.round((expiry - now) / 86_400_000);
    }
    const existing = stockNames.get(key);
    if (
      !existing ||
      (expiresInDays !== undefined &&
        (existing.expiresInDays === undefined || expiresInDays < existing.expiresInDays))
    ) {
      stockNames.set(key, { name: item.name, expiresInDays });
    }
  }

  const scores = new Map<string, RecipeScore>();
  for (const recipe of recipes) {
    const overlapItems: string[] = [];
    const expiringItems: string[] = [];
    for (const ingredient of recipe.ingredients) {
      const stocked = stockNames.get(normalizeIngredientName(ingredient.name));
      if (!stocked) continue;
      overlapItems.push(stocked.name);
      if (stocked.expiresInDays !== undefined && stocked.expiresInDays <= EXPIRING_SOON_DAYS) {
        expiringItems.push(stocked.name);
      }
    }
    scores.set(recipe.id, {
      recipe,
      overlapItems,
      expiringItems,
      score: expiringItems.length * 3 + overlapItems.length,
    });
  }
  return scores;
}

function reasonsFor(
  score: RecipeScore | undefined,
  extra: { anchorTag?: string; pinnedNote?: string },
): string[] {
  const reasons: string[] = [];
  if (extra.pinnedNote !== undefined) {
    reasons.push(extra.pinnedNote ? `pinned: ${extra.pinnedNote}` : 'pinned by the family');
  }
  if (extra.anchorTag) {
    reasons.push(`the ${extra.anchorTag} anchor`);
  }
  if (score && score.expiringItems.length > 0) {
    reasons.push(`uses ${score.expiringItems.join(' and ')} before they expire`);
  }
  if (score && score.overlapItems.length > 0) {
    reasons.push(`uses ${score.overlapItems.slice(0, 3).join(', ')} already in the kitchen`);
  }
  return reasons;
}

/**
 * The week builder. Hard allergen filter first, always. Then: pinned meals
 * from the current plan carry over untouched (the user's word beats the
 * scorer), the anchor meal lands on its night, and remaining nights fill by
 * a deterministic score that favors what expires soonest, then what the
 * kitchen already holds, then price, inside the weekly budget. Every pick
 * carries data-backed reasons the assistant can say out loud.
 */
export function proposeWeek(input: {
  household: Household;
  recipes: readonly Recipe[];
  preferences: Preferences;
  inventory?: readonly InventoryItem[];
  currentPlan?: WeekPlan | null;
  anchor?: { day: Day; tag: string };
  now?: string;
}): WeekProposal {
  const nowIso = input.now ?? new Date().toISOString();
  const exclusions = householdAllergens(input.household);
  const { safe, blocked } = filterSafeRecipes(input.recipes, exclusions);
  const safeIds = new Set(safe.map((recipe) => recipe.id));
  const scores = scoreRecipes(safe, input.inventory ?? [], nowIso);

  const busy = new Set(input.preferences.busyNights ?? []);
  const cookNights = DAYS.filter((day) => !busy.has(day));

  const meals: ProposedMeal[] = [];
  const used = new Set<string>();
  let total = 0;
  const budget = input.household.weeklyBudget;
  const costOf = (recipeId: string): number =>
    safe.find((recipe) => recipe.id === recipeId)?.estimatedCost ?? 0;

  // Pinned meals carry over first. Safety still governs: a pin on a recipe
  // the filter now blocks does not survive.
  for (const meal of input.currentPlan?.meals ?? []) {
    if (!meal.pinned || !safeIds.has(meal.recipeId)) continue;
    meals.push({
      ...meal,
      reasons: reasonsFor(scores.get(meal.recipeId), { pinnedNote: meal.note ?? '' }),
    });
    used.add(meal.recipeId);
    total += costOf(meal.recipeId);
  }

  if (
    input.anchor &&
    cookNights.includes(input.anchor.day) &&
    !meals.some((meal) => meal.day === input.anchor?.day)
  ) {
    const anchorTag = input.anchor.tag;
    const anchorRecipe = [...safe]
      .filter((recipe) => recipe.tags.includes(anchorTag) && !used.has(recipe.id))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (anchorRecipe && total + anchorRecipe.estimatedCost <= budget) {
      meals.push({
        day: input.anchor.day,
        recipeId: anchorRecipe.id,
        reasons: reasonsFor(scores.get(anchorRecipe.id), { anchorTag }),
      });
      used.add(anchorRecipe.id);
      total += anchorRecipe.estimatedCost;
    }
  }

  const fillOrder = [...safe].sort((a, b) => {
    const scoreA = scores.get(a.id)?.score ?? 0;
    const scoreB = scores.get(b.id)?.score ?? 0;
    return scoreB - scoreA || a.estimatedCost - b.estimatedCost || a.id.localeCompare(b.id);
  });

  for (const day of cookNights) {
    if (meals.some((meal) => meal.day === day)) continue;
    const pick = fillOrder.find(
      (recipe) => !used.has(recipe.id) && total + recipe.estimatedCost <= budget,
    );
    if (!pick) continue;
    meals.push({ day, recipeId: pick.id, reasons: reasonsFor(scores.get(pick.id), {}) });
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
