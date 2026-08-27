import { normalizeIngredientName } from './ingredients';
import type { GroceryLine, InventoryItem, PriceHint, Recipe, WeekPlan } from './types';

/**
 * The grocery list is a pure delta: everything the plan needs minus what the
 * pantry already holds. Quantities subtract only when units match after name
 * normalization. On a unit mismatch the full planned quantity stays on the
 * list, which errs toward buying rather than silently assuming coverage.
 */
export function buildGroceryList(input: {
  plan: WeekPlan;
  recipes: readonly Recipe[];
  inventory: readonly InventoryItem[];
  priceHints: readonly PriceHint[];
}): GroceryLine[] {
  const recipesById = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));

  // Aggregate what the week needs, keyed by normalized name + unit.
  const needs = new Map<string, { name: string; quantity: number; unit: string }>();
  for (const meal of input.plan.meals) {
    const recipe = recipesById.get(meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const name = normalizeIngredientName(ingredient.name);
      const key = `${name}|${ingredient.unit}`;
      const existing = needs.get(key);
      if (existing) {
        existing.quantity += ingredient.quantity;
      } else {
        needs.set(key, { name, quantity: ingredient.quantity, unit: ingredient.unit });
      }
    }
  }

  // Aggregate what the pantry holds, same key.
  const stock = new Map<string, number>();
  for (const item of input.inventory) {
    const key = `${normalizeIngredientName(item.name)}|${item.unit}`;
    stock.set(key, (stock.get(key) ?? 0) + item.quantity);
  }

  const lines: GroceryLine[] = [];
  for (const [key, need] of needs) {
    const have = stock.get(key) ?? 0;
    const remaining = need.quantity - have;
    // Float subtraction leaves residue (0.1 + 0.2 - 0.3), which would render
    // as a scientific-notation shopping line. Treat a sliver as covered.
    if (remaining < 1e-9) continue;
    lines.push({
      name: need.name,
      quantity: Math.round(remaining * 100) / 100,
      unit: need.unit,
      bestPrice: cheapestHint(need.name, need.unit, input.priceHints),
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  return lines;
}

function cheapestHint(
  normalizedName: string,
  unit: string,
  hints: readonly PriceHint[],
): GroceryLine['bestPrice'] {
  let best: GroceryLine['bestPrice'];
  for (const hint of hints) {
    if (normalizeIngredientName(hint.itemName) !== normalizedName) continue;
    if (hint.unit !== unit) continue;
    if (!best || hint.price < best.price) {
      best = { store: hint.store, price: hint.price, unit: hint.unit };
    }
  }
  return best;
}
