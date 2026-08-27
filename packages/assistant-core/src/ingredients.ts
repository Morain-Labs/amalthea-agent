/**
 * Canonical form for ingredient comparisons across the brain. Allergen
 * matching and the plan-minus-pantry delta both compare normalized names, so
 * "Peanut Butter " and "peanut  butter" are the same ingredient.
 *
 * Punctuation becomes a space. The allergen scanner matches whole words, so
 * without this "peanut-butter" is one unmatchable token and slips past the
 * peanut check. Any separator has to break into words the same way.
 */
export function normalizeIngredientName(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
