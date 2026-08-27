import { describe, expect, it } from 'vitest';
import { TOOL_NAMES, createTools } from './tools';
import { createInMemoryPort } from './testing';
import type { InMemorySeed } from './testing';
import type { Recipe } from './types';

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

function seed(): InMemorySeed {
  nextId = 0;
  return {
    household: {
      id: 'h-reyes',
      name: 'Reyes family',
      weeklyBudget: 120,
      members: [
        { id: 'm-dana', name: 'Dana', allergens: [] },
        { id: 'm-sam', name: 'Sam', allergens: [] },
        { id: 'm-ellis', name: 'Ellis', age: 9, allergens: ['peanut'] },
        { id: 'm-june', name: 'June', age: 6, allergens: [] },
      ],
    },
    inventory: [
      {
        id: 'i-1',
        name: 'carrots',
        quantity: 2,
        unit: 'lb',
        location: 'fridge',
        purchasedAt: '2026-08-20T00:00:00.000Z',
        shelfLifeDays: 21,
      },
    ],
    recipes: [
      recipe({ id: 'r-tacos', title: 'Family taco night', tags: ['taco-night'], estimatedCost: 14 }),
      recipe({ id: 'r-satay', title: 'Chicken satay', allergens: ['peanut'] }),
      recipe({ id: 'r-a', estimatedCost: 8 }),
      recipe({ id: 'r-b', estimatedCost: 9 }),
      recipe({ id: 'r-c', estimatedCost: 10 }),
      recipe({ id: 'r-d', estimatedCost: 11 }),
      recipe({ id: 'r-e', estimatedCost: 12 }),
      recipe({ id: 'r-f', estimatedCost: 13 }),
      recipe({ id: 'r-g', estimatedCost: 15 }),
    ],
    priceHints: [
      { itemName: 'carrots', store: 'Valu-Mart', price: 1.29, unit: 'lb', seenAt: '2026-08-20' },
    ],
  };
}

const NOW = '2026-08-26T12:00:00.000Z';

function setup() {
  const port = createInMemoryPort(seed());
  const tools = createTools(port, { now: () => NOW });
  const byName = new Map<string, (typeof tools)[number]>(
    tools.map((tool) => [tool.name, tool]),
  );
  const call = async (name: string, args: unknown = {}) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`no such tool: ${name}`);
    return tool.execute(args);
  };
  return { port, tools, call };
}

describe('the tool contract', () => {
  it('exposes exactly the eight app buttons', () => {
    const { tools } = setup();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(TOOL_NAMES).toHaveLength(8);
  });
});

describe('get_pantry', () => {
  it('returns items with deterministic expiry estimates', async () => {
    const { call } = setup();
    const result = (await call('get_pantry')) as {
      items: Array<{ name: string; expiresInDays?: number }>;
    };
    expect(result.items).toHaveLength(1);
    // Purchased 2026-08-20 with 21 days shelf life, asked on 2026-08-26.
    expect(result.items[0]?.expiresInDays).toBe(15);
  });
});

describe('propose_week', () => {
  it('persists the proposal as the current plan through the port', async () => {
    const { port, call } = setup();
    const result = (await call('propose_week', {
      anchorDay: 'tuesday',
      anchorTag: 'taco-night',
    })) as { planId: string; meals: Array<{ day: string; recipeId: string }> };
    expect(result.meals.length).toBeGreaterThan(0);
    const saved = await port.getCurrentPlan();
    expect(saved?.id).toBe(result.planId);
    expect(saved?.meals.find((meal) => meal.day === 'tuesday')?.recipeId).toBe('r-tacos');
  });

  it('never proposes the peanut recipe for this household', async () => {
    const { call } = setup();
    const result = (await call('propose_week')) as {
      meals: Array<{ recipeId: string }>;
      blocked: Array<{ title: string; allergens: string[] }>;
    };
    expect(result.meals.every((meal) => meal.recipeId !== 'r-satay')).toBe(true);
    expect(result.blocked.some((b) => b.title === 'Chicken satay')).toBe(true);
  });
});

describe('swap_meal', () => {
  it('swaps an unpinned day and persists', async () => {
    const { port, call } = setup();
    await call('propose_week');
    const before = await port.getCurrentPlan();
    const beforeMonday = before?.meals.find((meal) => meal.day === 'monday')?.recipeId;
    const result = (await call('swap_meal', { day: 'monday' })) as {
      day: string;
      recipeId: string;
    };
    expect(result.recipeId).not.toBe(beforeMonday);
    const after = await port.getCurrentPlan();
    expect(after?.meals.find((meal) => meal.day === 'monday')?.recipeId).toBe(result.recipeId);
  });

  it('refuses a pinned day with a spoken reason', async () => {
    const { call } = setup();
    await call('propose_week');
    await call('pin_meal_with_note', { day: 'monday', note: 'kids pick' });
    const result = (await call('swap_meal', { day: 'monday' })) as { error: string };
    expect(result.error).toMatch(/pinned/i);
  });

  it('rejects a day outside the week', async () => {
    const { call } = setup();
    await expect(call('swap_meal', { day: 'someday' })).rejects.toThrow();
  });
});

describe('build_grocery_list', () => {
  it('returns the plan-minus-pantry delta with best prices', async () => {
    const { call } = setup();
    await call('propose_week');
    const result = (await call('build_grocery_list')) as {
      lines: Array<{ name: string; quantity: number; bestPrice?: { store: string } }>;
    };
    const carrots = result.lines.find((line) => line.name === 'carrots');
    // Seven dinners each want 1 lb of carrots, pantry holds 2.
    expect(carrots?.quantity).toBe(5);
    expect(carrots?.bestPrice?.store).toBe('Valu-Mart');
  });
});

describe('pin_meal_with_note', () => {
  it('persists the pin and the note on the plan', async () => {
    const { port, call } = setup();
    await call('propose_week');
    await call('pin_meal_with_note', { day: 'friday', note: 'pizza with grandma' });
    const plan = await port.getCurrentPlan();
    const friday = plan?.meals.find((meal) => meal.day === 'friday');
    expect(friday?.pinned).toBe(true);
    expect(friday?.note).toBe('pizza with grandma');
  });
});

describe('save_adjustment and set_preferences', () => {
  it('appends adjustments through the port', async () => {
    const { port, call } = setup();
    await call('save_adjustment', { note: 'less salt next time', recipeId: 'r-a' });
    const adjustments = await port.listAdjustments();
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]?.note).toBe('less salt next time');
    expect(adjustments[0]?.createdAt).toBe(NOW);
  });

  it('merges preference answers and validates busy nights', async () => {
    const { port, call } = setup();
    await call('set_preferences', { answers: { 'budget-feel': 'tight this month' } });
    await call('set_preferences', { busyNights: ['thursday'] });
    const preferences = await port.getPreferences();
    expect(preferences.answers['budget-feel']).toBe('tight this month');
    expect(preferences.busyNights).toEqual(['thursday']);
    await expect(call('set_preferences', { busyNights: ['someday'] })).rejects.toThrow();
  });
});
