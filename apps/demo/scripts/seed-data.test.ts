import { describe, expect, it } from 'vitest';
import {
  filterSafeRecipes,
  normalizeIngredientName,
  recipeAllergens,
} from '@amalthea/assistant-core';
import { household, inventory, priceHints, recipes } from './seed-data';

describe('seed recipes', () => {
  it('ships forty recipes with unique ids', () => {
    expect(recipes).toHaveLength(40);
    expect(new Set(recipes.map((recipe) => recipe.id)).size).toBe(40);
  });

  it('declares at least everything the allergen table scans', () => {
    for (const recipe of recipes) {
      const effective = recipeAllergens(recipe);
      const undeclared = effective.filter((allergen) => !recipe.allergens.includes(allergen));
      expect(undeclared, `${recipe.title} is missing declarations`).toEqual([]);
    }
  });

  it('has exactly one taco-night anchor', () => {
    const anchors = recipes.filter((recipe) => recipe.tags.includes('taco-night'));
    expect(anchors.map((recipe) => recipe.id)).toEqual(['r-taco-night']);
  });

  it('carries peanut recipes for the block scene', () => {
    const peanut = recipes.filter((recipe) => recipeAllergens(recipe).includes('peanut'));
    expect(peanut.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves enough safe recipes for a peanut-free week under budget', () => {
    const { safe } = filterSafeRecipes(recipes, ['peanut']);
    expect(safe.length).toBeGreaterThanOrEqual(7);
    const cheapestSeven = safe
      .map((recipe) => recipe.estimatedCost)
      .sort((a, b) => a - b)
      .slice(0, 7)
      .reduce((sum, cost) => sum + cost, 0);
    expect(cheapestSeven).toBeLessThanOrEqual(household.weeklyBudget);
  });
});

describe('seed inventory and prices', () => {
  it('has unique inventory ids and positive shelf lives', () => {
    expect(new Set(inventory.map((item) => item.id)).size).toBe(inventory.length);
    for (const item of inventory) {
      expect(item.shelfLifeDays).toBeGreaterThan(0);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it('prices only things the kitchen actually uses', () => {
    const known = new Set<string>();
    for (const item of inventory) known.add(normalizeIngredientName(item.name));
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        known.add(normalizeIngredientName(ingredient.name));
      }
    }
    for (const hint of priceHints) {
      expect(
        known.has(normalizeIngredientName(hint.itemName)),
        `${hint.itemName} is priced but unused`,
      ).toBe(true);
    }
  });

  it('freezes the Reyes family as specified', () => {
    expect(household.members.map((member) => member.name)).toEqual([
      'Dana',
      'Sam',
      'Ellis',
      'June',
    ]);
    expect(household.weeklyBudget).toBe(120);
    const ellis = household.members.find((member) => member.name === 'Ellis');
    expect(ellis?.allergens).toEqual(['peanut']);
  });
});
