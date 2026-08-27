import { normalizeIngredientName } from './ingredients';
import type { Household, Recipe } from './types';

/**
 * The deterministic allergen table. A fixed lookup, never a model guess: the
 * model suggests, this table blocks. Matching is whole-word on normalized
 * names, biased toward over-blocking, and the result is assistive filtering,
 * not a safety certification.
 */
export const ALLERGEN_TABLE: Readonly<Record<string, readonly string[]>> = {
  peanut: ['peanut', 'peanuts', 'peanut butter', 'peanut oil', 'satay sauce', 'groundnut'],
  'tree-nut': [
    'almond',
    'almonds',
    'cashew',
    'cashews',
    'walnut',
    'walnuts',
    'pecan',
    'pecans',
    'pistachio',
    'pistachios',
    'hazelnut',
    'hazelnuts',
  ],
  dairy: [
    'milk',
    'butter',
    'cheese',
    'cheddar cheese',
    'mozzarella',
    'parmesan',
    'cream',
    'heavy cream',
    'sour cream',
    'yogurt',
  ],
  egg: ['egg', 'eggs', 'mayonnaise'],
  gluten: [
    'wheat flour',
    'flour',
    'flour tortillas',
    'bread',
    'breadcrumbs',
    'pasta',
    'spaghetti',
    'noodles',
    'soy sauce',
  ],
  soy: ['soy sauce', 'tofu', 'edamame', 'soybeans'],
  fish: ['salmon', 'tuna', 'anchovies', 'fish sauce', 'tilapia', 'cod'],
  shellfish: ['shrimp', 'crab', 'lobster', 'scallops'],
};

export const KNOWN_ALLERGENS = Object.keys(ALLERGEN_TABLE);

interface TermMatch {
  allergen: string;
  start: number;
  end: number;
}

/**
 * Scans one ingredient name against the table. Deterministic, no model.
 * Terms match as whole-word phrases, and the longest phrase wins: a match
 * whose words sit strictly inside a longer matched phrase is suppressed, so
 * 'peanut butter' reads as peanut, not dairy, while plain 'butter' still
 * reads as dairy. Identical spans all count, so 'soy sauce' stays both soy
 * and gluten.
 */
export function ingredientAllergens(name: string): string[] {
  const words = normalizeIngredientName(name).split(' ').filter(Boolean);
  const matches: TermMatch[] = [];
  for (const [allergen, terms] of Object.entries(ALLERGEN_TABLE)) {
    for (const term of terms) {
      const termWords = term.split(' ');
      for (let start = 0; start + termWords.length <= words.length; start++) {
        const matched = termWords.every((word, offset) => words[start + offset] === word);
        if (matched) {
          matches.push({ allergen, start, end: start + termWords.length });
        }
      }
    }
  }
  const kept = matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other.start <= match.start &&
          other.end >= match.end &&
          other.end - other.start > match.end - match.start,
      ),
  );
  return [...new Set(kept.map((match) => match.allergen))];
}

/** Declared allergens unioned with a scan of every ingredient. */
export function recipeAllergens(recipe: Recipe): string[] {
  const found = new Set(recipe.allergens);
  for (const ingredient of recipe.ingredients) {
    for (const allergen of ingredientAllergens(ingredient.name)) {
      found.add(allergen);
    }
  }
  return [...found];
}

export function isRecipeSafeFor(recipe: Recipe, memberAllergens: readonly string[]): boolean {
  if (memberAllergens.length === 0) return true;
  const present = new Set(recipeAllergens(recipe));
  return !memberAllergens.some((allergen) => present.has(allergen));
}

export interface BlockedRecipe {
  recipe: Recipe;
  /** The allergens that caused the block, from the exclusion list. */
  allergens: string[];
}

/**
 * The hard-exclusion filter. Splits recipes into safe and blocked for the
 * given exclusion list, with the blocking allergens named so the assistant
 * can say why out loud.
 */
export function filterSafeRecipes(
  recipes: readonly Recipe[],
  excludeAllergens: readonly string[],
): { safe: Recipe[]; blocked: BlockedRecipe[] } {
  const safe: Recipe[] = [];
  const blocked: BlockedRecipe[] = [];
  for (const recipe of recipes) {
    const present = new Set(recipeAllergens(recipe));
    const hits = excludeAllergens.filter((allergen) => present.has(allergen));
    if (hits.length > 0) {
      blocked.push({ recipe, allergens: hits });
    } else {
      safe.push(recipe);
    }
  }
  return { safe, blocked };
}

/** The union of every member's allergens: shared meals exclude all of them. */
export function householdAllergens(household: Household): string[] {
  const all = new Set<string>();
  for (const member of household.members) {
    for (const allergen of member.allergens) {
      all.add(allergen);
    }
  }
  return [...all];
}
