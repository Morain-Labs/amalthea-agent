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

describe('proposeWeek, feedback and freshness', () => {
  const NOW = '2026-08-26T12:00:00.000Z';

  it('carries pinned meals from the current plan into the next proposal', () => {
    const firstProposal = proposeWeek({
      household,
      recipes: pool,
      preferences: { answers: {} },
    });
    const currentPlan: WeekPlan = {
      id: 'p-old',
      householdId: household.id,
      createdAt: NOW,
      meals: firstProposal.meals.map((meal) =>
        meal.day === 'friday'
          ? { day: meal.day, recipeId: meal.recipeId, pinned: true, note: 'grandma visits' }
          : { day: meal.day, recipeId: meal.recipeId },
      ),
    };
    const pinnedRecipe = currentPlan.meals.find((meal) => meal.day === 'friday')?.recipeId;
    const next = proposeWeek({
      household,
      recipes: pool,
      preferences: { answers: {} },
      currentPlan,
      now: NOW,
    });
    const friday = next.meals.find((meal) => meal.day === 'friday');
    expect(friday?.recipeId).toBe(pinnedRecipe);
    expect(friday?.pinned).toBe(true);
    expect(friday?.note).toBe('grandma visits');
    expect(friday?.reasons.join(' ')).toMatch(/pinned/);
  });

  it('prefers recipes that use what expires soonest and says so', () => {
    const expiringRecipe: Recipe = {
      id: 'r-expiring',
      title: 'Uses the tomatoes',
      ingredients: [{ name: 'tomatoes', quantity: 3, unit: 'count' }],
      allergens: [],
      tags: [],
      estimatedCost: 12,
      servings: 4,
    };
    const proposal = proposeWeek({
      household,
      recipes: [...pool, expiringRecipe],
      preferences: { answers: {} },
      inventory: [
        {
          id: 'i-tomatoes',
          name: 'tomatoes',
          quantity: 3,
          unit: 'count',
          location: 'fridge',
          purchasedAt: '2026-08-23T00:00:00.000Z',
          shelfLifeDays: 7,
        },
      ],
      now: NOW,
    });
    // Cheaper recipes exist, but the expiring-tomatoes recipe must be in the
    // week, with the reason said out loud.
    const picked = proposal.meals.find((meal) => meal.recipeId === 'r-expiring');
    expect(picked).toBeDefined();
    expect(picked?.reasons.join(' ')).toMatch(/tomatoes before they expire/);
  });

  it('gives every filled night data-backed reasons when the kitchen overlaps', () => {
    const proposal = proposeWeek({
      household,
      recipes: pool,
      preferences: { answers: {} },
      inventory: [
        { id: 'i-carrots', name: 'carrots', quantity: 6, unit: 'count', location: 'fridge' },
      ],
      now: NOW,
    });
    for (const meal of proposal.meals) {
      expect(meal.reasons.join(' ')).toMatch(/carrots already in the kitchen/);
    }
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
    const result = swapMeal({ plan, recipes: pool, household, day: 'monday' })?.plan;
    expect(result).not.toBeUndefined();
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

  it('never hands back the meal just rejected', () => {
    // The old behavior restarted at the cheapest option every time, so two
    // recipes traded places forever and asking twice returned the meal the
    // user had just turned down.
    let working = plan;
    const rejected: string[] = [];
    for (let round = 0; round < 4; round++) {
      const before = working.meals.find((meal) => meal.day === 'monday')?.recipeId;
      const result = swapMeal({ plan: working, recipes: pool, household, day: 'monday' });
      if (!result || !before) break;
      const after = result.replacement.recipeId;
      expect(after, 'swap must actually change the meal').not.toBe(before);
      const justRejected = rejected[rejected.length - 1];
      if (justRejected) {
        expect(after, 'must not revert to the previous meal').not.toBe(justRejected);
      }
      rejected.push(before);
      working = result.plan;
    }
    expect(rejected.length).toBeGreaterThanOrEqual(3);
  });

  it('returns reasons so the assistant can explain the new pick', () => {
    const result = swapMeal({
      plan,
      recipes: pool,
      household,
      day: 'monday',
      inventory: [
        { id: 'i-carrots', name: 'carrots', quantity: 6, unit: 'lb', location: 'fridge' },
      ],
      now: '2026-08-26T12:00:00.000Z',
    });
    expect(result?.replacement.reasons.join(' ')).toMatch(/already in the kitchen/);
  });

  it('never swaps in an excluded recipe', () => {
    for (const day of ['monday', 'wednesday', 'friday'] as const) {
      const result = swapMeal({ plan, recipes: pool, household, day })?.plan;
      const swapped = result?.meals.find((meal) => meal.day === day);
      if (!swapped) continue;
      const picked = pool.find((r) => r.id === swapped.recipeId);
      expect(recipeAllergens(picked as Recipe)).not.toContain('peanut');
    }
  });
});
