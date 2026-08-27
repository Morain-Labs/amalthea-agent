import { describe, expect, it } from 'vitest';
import { buildGroceryList } from './groceries';
import type { InventoryItem, PriceHint, Recipe, WeekPlan } from './types';

const beefTacos: Recipe = {
  id: 'r-tacos',
  title: 'Family taco night',
  ingredients: [
    { name: 'ground beef', quantity: 2, unit: 'lb' },
    { name: 'flour tortillas', quantity: 8, unit: 'count' },
    { name: 'yellow onion', quantity: 1, unit: 'count' },
  ],
  allergens: ['gluten'],
  tags: ['taco-night'],
  estimatedCost: 14,
  servings: 4,
};

const soup: Recipe = {
  id: 'r-soup',
  title: 'Weeknight vegetable soup',
  ingredients: [
    { name: 'yellow onion', quantity: 2, unit: 'count' },
    { name: 'vegetable broth', quantity: 6, unit: 'cup' },
  ],
  allergens: [],
  tags: ['vegetarian'],
  estimatedCost: 9,
  servings: 4,
};

const plan: WeekPlan = {
  id: 'p1',
  householdId: 'h1',
  createdAt: '2026-08-26T00:00:00.000Z',
  meals: [
    { day: 'monday', recipeId: 'r-soup' },
    { day: 'tuesday', recipeId: 'r-tacos' },
  ],
};

const inventory: InventoryItem[] = [
  { id: 'i1', name: 'Ground Beef', quantity: 1, unit: 'lb', location: 'freezer' },
  { id: 'i2', name: 'yellow onion', quantity: 5, unit: 'count', location: 'pantry' },
  { id: 'i3', name: 'vegetable broth', quantity: 2, unit: 'cup', location: 'pantry' },
];

const priceHints: PriceHint[] = [
  { itemName: 'ground beef', store: 'Valu-Mart', price: 4.99, unit: 'lb', seenAt: '2026-08-20' },
  { itemName: 'ground beef', store: 'Greenfield Market', price: 5.79, unit: 'lb', seenAt: '2026-08-22' },
  { itemName: 'flour tortillas', store: 'Valu-Mart', price: 2.49, unit: 'count', seenAt: '2026-08-20' },
];

describe('buildGroceryList', () => {
  const list = buildGroceryList({ plan, recipes: [beefTacos, soup], inventory, priceHints });
  const byName = new Map(list.map((line) => [line.name, line]));

  it('subtracts pantry stock from plan needs', () => {
    expect(byName.get('ground beef')?.quantity).toBe(1);
  });

  it('drops lines the pantry fully covers', () => {
    expect(byName.has('yellow onion')).toBe(false);
  });

  it('aggregates needs across recipes before subtracting', () => {
    // Soup needs 6 cups, pantry holds 2.
    expect(byName.get('vegetable broth')?.quantity).toBe(4);
  });

  it('keeps lines the pantry does not carry at all', () => {
    expect(byName.get('flour tortillas')?.quantity).toBe(8);
  });

  it('attaches the cheapest matching price hint', () => {
    expect(byName.get('ground beef')?.bestPrice).toEqual({
      store: 'Valu-Mart',
      price: 4.99,
      unit: 'lb',
    });
  });

  it('is conservative on unit mismatches', () => {
    const mismatchInventory: InventoryItem[] = [
      { id: 'i4', name: 'vegetable broth', quantity: 1, unit: 'carton', location: 'pantry' },
    ];
    const result = buildGroceryList({
      plan,
      recipes: [soup],
      inventory: mismatchInventory,
      priceHints: [],
    });
    const broth = result.find((line) => line.name === 'vegetable broth');
    expect(broth?.quantity).toBe(6);
  });

  it('returns a stable, sorted list', () => {
    const again = buildGroceryList({ plan, recipes: [beefTacos, soup], inventory, priceHints });
    expect(again).toEqual(list);
    const names = list.map((line) => line.name);
    expect([...names].sort()).toEqual(names);
  });
});
