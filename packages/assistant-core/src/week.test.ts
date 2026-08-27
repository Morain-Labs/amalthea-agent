import { describe, expect, it } from 'vitest';
import { proposeWeek, swapMeal } from './week';
import { recipeAllergens } from './allergens';
import type { Household, Recipe, WeekPlan } from './types';

const household: Household = {
  id: 'h-reyes',
  name: 'Reyes family',
  weeklyBudget: 120,
  members: [
    { id: 'm-dana', name: 'Dana', allergens: [] },
    { id: 'm-sam', name: 'Sam', allergens: [] },
    { id: 'm-ellis', name: 'Ellis', age: 9, allergens: ['peanut'] },
    { id: 'm-june', name: 'June', age: 6, allergens: [] },
  ],
};

let nextId = 0;
function recipe(overrides: Partial<Recipe>): Recipe {
  nextId += 1;
  return {
    id: `r-${nextId}`,
    title: `Recipe ${nextId}`,
    ingredients: [{ name: 'carrots', quantity: 1, unit: 'lb' }],
    allergens: [],
    tags: [],
    estimatedCost: 10,
    servings: 4,
    ...overrides,
  };
}

const tacoNight = recipe({ id: 'r-tacos', title: 'Family taco night', tags: ['taco-night'], estimatedCost: 14 });
const satay = recipe({
  id: 'r-satay',
  title: 'Chicken satay',
  allergens: ['peanut'],
  estimatedCost: 12,
});
const pool = [
  tacoNight,
  satay,
  recipe({ id: 'r-a', estimatedCost: 8 }),
  recipe({ id: 'r-b', estimatedCost: 9 }),
  recipe({ id: 'r-c', estimatedCost: 10 }),
  recipe({ id: 'r-d', estimatedCost: 11 }),
  recipe({ id: 'r-e', estimatedCost: 12 }),
  recipe({ id: 'r-f', estimatedCost: 13 }),
  recipe({ id: 'r-g', estimatedCost: 15 }),
  recipe({ id: 'r-h', estimatedCost: 16 }),
];

describe('proposeWeek', () => {
  const proposal = proposeWeek({
    household,
    recipes: pool,
    preferences: { answers: {}, busyNights: ['thursday'] },
    anchor: { day: 'tuesday', tag: 'taco-night' },
  });

  it('puts the anchor recipe on the anchor day', () => {
    const tuesday = proposal.meals.find((meal) => meal.day === 'tuesday');
    expect(tuesday?.recipeId).toBe('r-tacos');
  });

  it('never proposes a recipe carrying an excluded allergen', () => {
    const byId = new Map(pool.map((r) => [r.id, r]));
    for (const meal of proposal.meals) {
      const picked = byId.get(meal.recipeId);
      expect(picked).toBeDefined();
      expect(recipeAllergens(picked as Recipe)).not.toContain('peanut');
    }
  });

  it('skips busy nights', () => {
    expect(proposal.meals.some((meal) => meal.day === 'thursday')).toBe(false);
  });

  it('stays inside the weekly budget', () => {
    expect(proposal.totalEstimatedCost).toBeLessThanOrEqual(household.weeklyBudget);
  });

  it('does not repeat a recipe inside one week', () => {
    const ids = proposal.meals.map((meal) => meal.recipeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic', () => {
    const again = proposeWeek({
      household,
      recipes: pool,
      preferences: { answers: {}, busyNights: ['thursday'] },
      anchor: { day: 'tuesday', tag: 'taco-night' },
    });
    expect(again).toEqual(proposal);
  });

  it('names what it blocked so the assistant can say why', () => {
    expect(proposal.blocked.map((b) => b.recipe.id)).toContain('r-satay');
  });
});

describe('swapMeal', () => {
  const proposal = proposeWeek({
    household,
    recipes: pool,
    preferences: { answers: {} },
    anchor: { day: 'tuesday', tag: 'taco-night' },
  });
  const plan: WeekPlan = {
    id: 'p1',
    householdId: household.id,
    createdAt: '2026-08-26T00:00:00.000Z',
    meals: proposal.meals,
  };

  it('replaces only the named day with a different safe recipe', () => {
    const result = swapMeal({ plan, recipes: pool, household, day: 'monday' });
    expect(result).not.toBeNull();
    const before = plan.meals.find((meal) => meal.day === 'monday');
    const after = result?.meals.find((meal) => meal.day === 'monday');
    expect(after?.recipeId).toBeDefined();
    expect(after?.recipeId).not.toBe(before?.recipeId);
    const others = (day: string) =>
      plan.meals.filter((meal) => meal.day !== 'monday' && meal.day === day);
    for (const meal of result?.meals ?? []) {
      if (meal.day !== 'monday') {
        expect(meal).toEqual(others(meal.day)[0]);
      }
    }
  });

  it('returns null when every safe recipe is already in the plan', () => {
    const smallPool = pool.slice(0, 8); // 7 safe recipes, 7 nights, no spare
    const smallProposal = proposeWeek({
      household,
      recipes: smallPool,
      preferences: { answers: {} },
    });
    const smallPlan: WeekPlan = {
      id: 'p2',
      householdId: household.id,
      createdAt: '2026-08-26T00:00:00.000Z',
      meals: smallProposal.meals,
    };
    expect(swapMeal({ plan: smallPlan, recipes: smallPool, household, day: 'monday' })).toBeNull();
  });

  it('refuses to swap a pinned meal', () => {
    const pinnedPlan: WeekPlan = {
      ...plan,
      meals: plan.meals.map((meal) =>
        meal.day === 'monday' ? { ...meal, pinned: true, note: 'kids pick' } : meal,
      ),
    };
    expect(swapMeal({ plan: pinnedPlan, recipes: pool, household, day: 'monday' })).toBeNull();
  });

  it('never swaps in an excluded recipe', () => {
    for (const day of ['monday', 'wednesday', 'friday'] as const) {
      const result = swapMeal({ plan, recipes: pool, household, day });
      const swapped = result?.meals.find((meal) => meal.day === day);
      if (!swapped) continue;
      const picked = pool.find((r) => r.id === swapped.recipeId);
      expect(recipeAllergens(picked as Recipe)).not.toContain('peanut');
    }
  });
});
