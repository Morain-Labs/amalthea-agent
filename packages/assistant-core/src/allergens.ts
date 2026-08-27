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
  fish: ['salmon', 'tuna', 'anchovies', 'anchovy', 'fish sauce', 'tilapia', 'cod', 'sardines'],
  shellfish: [
    'shrimp',
    'shrimps',
    'prawns',
    'crab',
    'lobster',
    'scallops',
    'clams',
    'mussels',
    'oysters',
    'crawfish',
  ],
  sesame: ['sesame', 'sesame seeds', 'sesame oil', 'tahini'],
};

export const KNOWN_ALLERGENS = Object.keys(ALLERGEN_TABLE);

/**
 * Spellings a household might record for an allergen, mapped to the table's
 * canonical key. Without this, "peanuts" or "Peanut" match nothing and the
 * filter silently protects no one.
 */
const ALLERGEN_ALIASES: Readonly<Record<string, string>> = {
  peanuts: 'peanut',
  groundnut: 'peanut',
  groundnuts: 'peanut',
  'tree nut': 'tree-nut',
  'tree nuts': 'tree-nut',
  treenut: 'tree-nut',
  treenuts: 'tree-nut',
  nut: 'tree-nut',
  nuts: 'tree-nut',
  milk: 'dairy',
  lactose: 'dairy',
  eggs: 'egg',
  wheat: 'gluten',
  celiac: 'gluten',
  coeliac: 'gluten',
  soya: 'soy',
  soybean: 'soy',
  soybeans: 'soy',
  crustacean: 'shellfish',
  crustaceans: 'shellfish',
  seafood: 'shellfish',
  'sesame seed': 'sesame',
  'sesame seeds': 'sesame',
  tahini: 'sesame',
};

/**
 * Maps a recorded allergen string to a canonical table key, or null when the
 * table cannot enforce it. Case, spacing, hyphens, and plurals all resolve.
 */
export function canonicalizeAllergen(raw: string): string | null {
  const flat = normalizeIngredientName(raw);
  if (!flat) return null;
  const hyphenated = flat.replace(/ /g, '-');
  const candidates = [flat, hyphenated, flat.replace(/s$/, ''), hyphenated.replace(/s$/, '')];
  for (const candidate of candidates) {
    const alias = ALLERGEN_ALIASES[candidate];
    if (alias) return alias;
    if (candidate in ALLERGEN_TABLE) return candidate;
  }
  return null;
}

/**
 * The form used for comparisons. Falls back to the normalized string when the
 * table does not know the allergen, so an exact match still blocks: the
 * filter errs toward over-blocking, never toward silently allowing.
 */
function comparable(raw: string): string {
  return canonicalizeAllergen(raw) ?? normalizeIngredientName(raw);
}

export interface AllergenReport {
  /** Canonical allergens the table actively enforces. */
  enforced: string[];
  /**
   * Recorded allergens the table does not know. These are still matched
   * literally against declared recipe allergens, but no ingredient scanning
   * backs them up, so the assistant must not claim they are enforced.
   */
  unrecognized: string[];
}

/** Splits recorded allergens into what the table can enforce and what it cannot. */
export function reviewAllergens(recorded: readonly string[]): AllergenReport {
  const enforced = new Set<string>();
  const unrecognized = new Set<string>();
  for (const entry of recorded) {
    const canonical = canonicalizeAllergen(entry);
    if (canonical) {
      enforced.add(canonical);
    } else if (normalizeIngredientName(entry)) {
      unrecognized.add(entry.trim());
    }
  }
  return { enforced: [...enforced], unrecognized: [...unrecognized] };
}

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

/**
 * Declared allergens unioned with a scan of every ingredient. Declared
 * strings are canonicalized so a recipe saying "Peanuts" still reads as
 * peanut.
 */
export function recipeAllergens(recipe: Recipe): string[] {
  const found = new Set(recipe.allergens.map(comparable));
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
  return !memberAllergens.some((allergen) => present.has(comparable(allergen)));
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
    const hits = excludeAllergens.filter((allergen) => present.has(comparable(allergen)));
    if (hits.length > 0) {
      blocked.push({ recipe, allergens: hits });
    } else {
      safe.push(recipe);
    }
  }
  return { safe, blocked };
}

/**
 * The union of every member's allergens: shared meals exclude all of them.
 * Canonicalized, so "Peanut" and "peanuts" both actually block.
 */
export function householdAllergens(household: Household): string[] {
  const all = new Set<string>();
  for (const member of household.members) {
    for (const allergen of member.allergens) {
      if (normalizeIngredientName(allergen)) all.add(comparable(allergen));
    }
  }
  return [...all];
}

/** Household allergens split into what the table enforces and what it cannot. */
export function householdAllergenReport(household: Household): AllergenReport {
  return reviewAllergens(household.members.flatMap((member) => member.allergens));
}
