import { describe, expect, it } from 'vitest';
import {
  canonicalizeAllergen,
  filterSafeRecipes,
  householdAllergenReport,
  householdAllergens,
  ingredientAllergens,
  isRecipeSafeFor,
  recipeAllergens,
  reviewAllergens,
} from './allergens';
import type { Household, Recipe } from './types';

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 'r-test',
    title: 'Test recipe',
    ingredients: [],
    allergens: [],
    tags: [],
    estimatedCost: 10,
    servings: 4,
    ...overrides,
  };
}

const satay = recipe({
  id: 'r-satay',
  title: 'Chicken satay',
  allergens: ['peanut'],
  ingredients: [
    { name: 'chicken thighs', quantity: 2, unit: 'lb' },
    { name: 'peanut butter', quantity: 0.5, unit: 'cup' },
  ],
});

const undeclaredPeanut = recipe({
  id: 'r-noodles',
  title: 'Sesame noodles',
  allergens: [],
  ingredients: [{ name: 'Peanut  Butter', quantity: 0.25, unit: 'cup' }],
});

const tacos = recipe({
  id: 'r-tacos',
  title: 'Family taco night',
  allergens: ['dairy', 'gluten'],
  ingredients: [
    { name: 'ground beef', quantity: 1, unit: 'lb' },
    { name: 'flour tortillas', quantity: 8, unit: 'count' },
    { name: 'cheddar cheese', quantity: 8, unit: 'oz' },
  ],
});

const squashSoup = recipe({
  id: 'r-squash',
  title: 'Butternut squash soup',
  allergens: [],
  ingredients: [
    { name: 'butternut squash', quantity: 1, unit: 'count' },
    { name: 'vegetable broth', quantity: 4, unit: 'cup' },
  ],
});

describe('ingredientAllergens', () => {
  it('finds peanut in peanut butter', () => {
    expect(ingredientAllergens('peanut butter')).toContain('peanut');
  });

  it('is case and spacing insensitive', () => {
    expect(ingredientAllergens('  Peanut   Butter ')).toContain('peanut');
  });

  it('matches whole words only, not substrings inside words', () => {
    // 'butternut' contains 'butter' and 'peanut'-adjacent letters, but no
    // whole-word allergen term.
    expect(ingredientAllergens('butternut squash')).toEqual([]);
  });

  it('flags dairy for plain butter', () => {
    expect(ingredientAllergens('butter')).toContain('dairy');
  });

  it('lets the longest phrase win across allergens', () => {
    // 'peanut butter' is a peanut term. The 'butter' inside it must not read
    // as dairy.
    expect(ingredientAllergens('peanut butter')).toEqual(['peanut']);
  });

  it('keeps every allergen on identical spans', () => {
    // 'soy sauce' is a term under both soy and gluten.
    const hits = ingredientAllergens('soy sauce');
    expect(hits).toContain('soy');
    expect(hits).toContain('gluten');
  });
});

describe('recipeAllergens', () => {
  it('unions declared allergens with scanned ingredient hits', () => {
    expect(recipeAllergens(undeclaredPeanut)).toContain('peanut');
    expect(recipeAllergens(satay)).toContain('peanut');
  });
});

describe('the filter, blocking direction', () => {
  it('blocks a declared-allergen recipe for an allergic member', () => {
    expect(isRecipeSafeFor(satay, ['peanut'])).toBe(false);
  });

  it('blocks on ingredient scan even when the recipe declares nothing', () => {
    expect(isRecipeSafeFor(undeclaredPeanut, ['peanut'])).toBe(false);
  });

  it('reports which allergens blocked', () => {
    const { blocked } = filterSafeRecipes([satay, tacos], ['peanut']);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.recipe.id).toBe('r-satay');
    expect(blocked[0]?.allergens).toContain('peanut');
  });
});

describe('the filter, passing direction', () => {
  it('passes unrelated recipes for an allergic member', () => {
    expect(isRecipeSafeFor(tacos, ['peanut'])).toBe(true);
    expect(isRecipeSafeFor(squashSoup, ['peanut'])).toBe(true);
  });

  it('passes everything for a member with no allergens', () => {
    const { safe, blocked } = filterSafeRecipes([satay, tacos, squashSoup], []);
    expect(safe).toHaveLength(3);
    expect(blocked).toHaveLength(0);
  });
});

describe('punctuation cannot hide an allergen', () => {
  it('reads hyphenated names as words', () => {
    expect(ingredientAllergens('peanut-butter')).toContain('peanut');
    expect(ingredientAllergens('peanut_butter')).toContain('peanut');
    expect(ingredientAllergens('peanut butter, creamy')).toContain('peanut');
  });

  it('blocks a recipe whose only peanut source is hyphenated and undeclared', () => {
    const sneaky = recipe({
      id: 'r-sneaky',
      title: 'Undeclared noodles',
      allergens: [],
      ingredients: [{ name: 'peanut-butter', quantity: 1, unit: 'cup' }],
    });
    expect(isRecipeSafeFor(sneaky, ['peanut'])).toBe(false);
  });
});

describe('allergen vocabulary', () => {
  it('canonicalizes the spellings a household actually writes', () => {
    expect(canonicalizeAllergen('Peanut')).toBe('peanut');
    expect(canonicalizeAllergen('peanuts')).toBe('peanut');
    expect(canonicalizeAllergen('tree nut')).toBe('tree-nut');
    expect(canonicalizeAllergen('Tree Nuts')).toBe('tree-nut');
    expect(canonicalizeAllergen('milk')).toBe('dairy');
    expect(canonicalizeAllergen('wheat')).toBe('gluten');
  });

  it('returns null for an allergen the table cannot enforce', () => {
    expect(canonicalizeAllergen('mustard')).toBeNull();
  });

  it('blocks regardless of how the member spelled it', () => {
    for (const spelling of ['peanut', 'Peanut', 'peanuts', 'PEANUTS ']) {
      expect(isRecipeSafeFor(satay, [spelling]), `spelling: ${spelling}`).toBe(false);
    }
  });

  it('covers sesame, a US top-9 allergen', () => {
    expect(ingredientAllergens('tahini')).toContain('sesame');
    expect(canonicalizeAllergen('sesame')).toBe('sesame');
  });

  it('separates what it can enforce from what it cannot', () => {
    const report = reviewAllergens(['Peanuts', 'mustard', '  ']);
    expect(report.enforced).toEqual(['peanut']);
    expect(report.unrecognized).toEqual(['mustard']);
  });
});

describe('householdAllergens', () => {
  it('unions member allergens', () => {
    const household: Household = {
      id: 'h1',
      name: 'Test household',
      weeklyBudget: 120,
      members: [
        { id: 'm1', name: 'A', allergens: ['peanut'] },
        { id: 'm2', name: 'B', allergens: ['shellfish'] },
        { id: 'm3', name: 'C', allergens: [] },
      ],
    };
    expect(householdAllergens(household).sort()).toEqual(['peanut', 'shellfish']);
  });

  it('normalizes messy member spellings into enforceable keys', () => {
    const household: Household = {
      id: 'h2',
      name: 'Messy household',
      weeklyBudget: 120,
      members: [
        { id: 'm1', name: 'A', allergens: ['Peanuts'] },
        { id: 'm2', name: 'B', allergens: ['tree nut', 'mustard'] },
      ],
    };
    expect(householdAllergens(household)).toContain('peanut');
    expect(householdAllergens(household)).toContain('tree-nut');
    const report = householdAllergenReport(household);
    expect(report.enforced.sort()).toEqual(['peanut', 'tree-nut']);
    expect(report.unrecognized).toEqual(['mustard']);
  });
});
