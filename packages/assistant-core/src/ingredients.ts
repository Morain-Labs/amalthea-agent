/**
 * Canonical form for ingredient comparisons across the brain. Allergen
 * matching and the plan-minus-pantry delta both compare normalized names, so
 * "Peanut Butter " and "peanut  butter" are the same ingredient.
 */
export function normalizeIngredientName(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
