import { z } from 'zod';
import { recipeAllergens } from './allergens';
import { buildGroceryList } from './groceries';
import type { DataPort } from './port';
import { DAYS } from './types';
import type { Day, WeekPlan } from './types';
import { proposeWeek, swapMeal } from './week';

/**
 * The tools layer: the only write path. Every tool is an app button pressed
 * through the port the host supplied. The model never touches storage, never
 * names a household, and gets back plain data it can talk about.
 */
export const TOOL_NAMES = [
  'get_pantry',
  'get_recipes',
  'propose_week',
  'swap_meal',
  'build_grocery_list',
  'pin_meal_with_note',
  'save_adjustment',
  'set_preferences',
] as const;

export interface AssistantTool {
  name: (typeof TOOL_NAMES)[number];
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute(args: unknown): Promise<unknown>;
}

export interface ToolOptions {
  /** Clock, injectable for tests. Returns an ISO timestamp. */
  now?: () => string;
  /** Id source, injectable for tests. */
  newId?: () => string;
}

const daySchema = z.enum(DAYS);

const emptyArgs = z.object({});
const proposeArgs = z.object({
  anchorDay: daySchema.optional().describe('Day for the anchor meal, e.g. taco night.'),
  anchorTag: z.string().optional().describe('Recipe tag the anchor meal must carry.'),
});
const swapArgs = z.object({
  day: daySchema.describe('The day whose dinner to swap out.'),
});
const pinArgs = z.object({
  day: daySchema.describe('The day whose dinner to pin.'),
  note: z.string().min(1).describe('Why it is pinned, in the user\'s words.'),
});
const adjustmentArgs = z.object({
  note: z.string().min(1).describe('The adjustment worth remembering.'),
  recipeId: z.string().optional().describe('The recipe the note is about, when known.'),
});
const preferencesArgs = z.object({
  answers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Interview answers to persist, keyed by a stable question id.'),
  busyNights: z.array(daySchema).optional().describe('Nights the household does not cook.'),
});

function defaultId(): string {
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createTools(port: DataPort, options: ToolOptions = {}): AssistantTool[] {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? defaultId;

  const requirePlan = async (): Promise<WeekPlan | { error: string }> => {
    const plan = await port.getCurrentPlan();
    if (!plan) return { error: 'There is no current week plan yet. Propose a week first.' };
    return plan;
  };

  return [
    {
      name: 'get_pantry',
      description:
        'Lists the household inventory across fridge, freezer, and pantry, with ' +
        'quantities and estimated days until expiry where known.',
      parameters: emptyArgs,
      execute: async (args) => {
        emptyArgs.parse(args);
        const items = await port.getInventory();
        const today = new Date(now()).getTime();
        return {
          items: items.map((item) => {
            let expiresInDays: number | undefined;
            if (item.purchasedAt && item.shelfLifeDays !== undefined) {
              const expiry =
                new Date(item.purchasedAt).getTime() + item.shelfLifeDays * 86_400_000;
              expiresInDays = Math.round((expiry - today) / 86_400_000);
            }
            return { ...item, expiresInDays };
          }),
        };
      },
    },
    {
      name: 'get_recipes',
      description:
        'Lists the household recipe collection: titles, tags, servings, rough ' +
        'cost, effective allergens, and ingredient names.',
      parameters: emptyArgs,
      execute: async (args) => {
        emptyArgs.parse(args);
        const recipes = await port.getRecipes();
        return {
          recipes: recipes.map((recipe) => ({
            id: recipe.id,
            title: recipe.title,
            tags: recipe.tags,
            servings: recipe.servings,
            estimatedCost: recipe.estimatedCost,
            allergens: recipeAllergens(recipe),
            ingredientNames: recipe.ingredients.map((ingredient) => ingredient.name),
          })),
        };
      },
    },
    {
      name: 'propose_week',
      description:
        'Builds a week of dinners from the pantry, the recipes, the weekly ' +
        'budget, and preferences, honoring an optional anchor meal. Saves the ' +
        'result as the current plan and reports what the allergen table blocked.',
      parameters: proposeArgs,
      execute: async (args) => {
        const { anchorDay, anchorTag } = proposeArgs.parse(args);
        const [household, recipes, preferences, inventory, currentPlan] = await Promise.all([
          port.getHousehold(),
          port.getRecipes(),
          port.getPreferences(),
          port.getInventory(),
          port.getCurrentPlan(),
        ]);
        const anchor =
          anchorDay && anchorTag ? { day: anchorDay as Day, tag: anchorTag } : undefined;
        const proposal = proposeWeek({
          household,
          recipes,
          preferences,
          inventory,
          currentPlan,
          anchor,
          now: now(),
        });
        const plan: WeekPlan = {
          id: newId(),
          householdId: household.id,
          meals: proposal.meals.map(({ reasons: _reasons, ...meal }) => meal),
          createdAt: now(),
        };
        await port.savePlan(plan);
        const titles = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
        return {
          planId: plan.id,
          totalEstimatedCost: proposal.totalEstimatedCost,
          weeklyBudget: household.weeklyBudget,
          meals: proposal.meals.map((meal) => ({
            day: meal.day,
            recipeId: meal.recipeId,
            title: titles.get(meal.recipeId),
            pinned: meal.pinned,
            note: meal.note,
            reasons: meal.reasons,
          })),
          blocked: proposal.blocked.map((blockedRecipe) => ({
            title: blockedRecipe.recipe.title,
            allergens: blockedRecipe.allergens,
          })),
        };
      },
    },
    {
      name: 'swap_meal',
      description:
        'Swaps one night\'s dinner for the next-best safe recipe not already ' +
        'in the plan. Pinned meals are never swapped.',
      parameters: swapArgs,
      execute: async (args) => {
        const { day } = swapArgs.parse(args);
        const plan = await requirePlan();
        if ('error' in plan) return plan;
        const meal = plan.meals.find((planned) => planned.day === day);
        if (!meal) return { error: `There is no dinner planned for ${day}.` };
        if (meal.pinned) {
          return {
            error: `${day} is pinned${meal.note ? ` (${meal.note})` : ''}. Unpin it first if you want it changed.`,
          };
        }
        const [household, recipes] = await Promise.all([
          port.getHousehold(),
          port.getRecipes(),
        ]);
        const swapped = swapMeal({ plan, recipes, household, day });
        if (!swapped) {
          return { error: 'Every safe recipe is already on the plan, nothing to swap in.' };
        }
        await port.savePlan(swapped);
        const newMeal = swapped.meals.find((planned) => planned.day === day);
        const title = recipes.find((recipe) => recipe.id === newMeal?.recipeId)?.title;
        return { day, recipeId: newMeal?.recipeId, title };
      },
    },
    {
      name: 'build_grocery_list',
      description:
        'Builds the grocery list as plan minus pantry, with the cheapest known ' +
        'store price attached where the household has seen one.',
      parameters: emptyArgs,
      execute: async (args) => {
        emptyArgs.parse(args);
        const plan = await requirePlan();
        if ('error' in plan) return plan;
        const [recipes, inventory, priceHints] = await Promise.all([
          port.getRecipes(),
          port.getInventory(),
          port.getPriceHints(),
        ]);
        return { lines: buildGroceryList({ plan, recipes, inventory, priceHints }) };
      },
    },
    {
      name: 'pin_meal_with_note',
      description:
        'Pins one night\'s dinner so later proposals and swaps keep it, with a ' +
        'note in the user\'s words about why.',
      parameters: pinArgs,
      execute: async (args) => {
        const { day, note } = pinArgs.parse(args);
        const plan = await requirePlan();
        if ('error' in plan) return plan;
        const meal = plan.meals.find((planned) => planned.day === day);
        if (!meal) return { error: `There is no dinner planned for ${day}.` };
        const updated: WeekPlan = {
          ...plan,
          meals: plan.meals.map((planned) =>
            planned.day === day ? { ...planned, pinned: true, note } : planned,
          ),
        };
        await port.savePlan(updated);
        return { day, recipeId: meal.recipeId, pinned: true, note };
      },
    },
    {
      name: 'save_adjustment',
      description:
        'Saves a cooking adjustment or idea worth remembering, optionally tied ' +
        'to a recipe, so future suggestions can consult it.',
      parameters: adjustmentArgs,
      execute: async (args) => {
        const { note, recipeId } = adjustmentArgs.parse(args);
        const adjustment = { id: newId(), note, recipeId, createdAt: now() };
        await port.saveAdjustment(adjustment);
        return { saved: true, id: adjustment.id };
      },
    },
    {
      name: 'set_preferences',
      description:
        'Persists interview answers and household preferences like busy ' +
        'nights. Answers merge with what is already stored.',
      parameters: preferencesArgs,
      execute: async (args) => {
        const { answers, busyNights } = preferencesArgs.parse(args);
        const current = await port.getPreferences();
        const updated = {
          ...current,
          answers: { ...current.answers, ...(answers ?? {}) },
          ...(busyNights ? { busyNights } : {}),
        };
        await port.savePreferences(updated);
        return { saved: true, preferences: updated };
      },
    },
  ];
}
