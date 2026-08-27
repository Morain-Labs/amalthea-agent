import { describe, expect, it } from 'vitest';
import { normalizeIngredientName } from './ingredients';

describe('normalizeIngredientName', () => {
  it('lowercases and trims', () => {
    expect(normalizeIngredientName('  Peanut Butter ')).toBe('peanut butter');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeIngredientName('peanut\t butter')).toBe('peanut butter');
  });

  it('normalizes unicode compatibility forms', () => {
    // Fullwidth characters normalize to ASCII under NFKC.
    expect(normalizeIngredientName('ｐｅａｎｕｔ')).toBe('peanut');
  });

  it('keeps an empty string empty', () => {
    expect(normalizeIngredientName('   ')).toBe('');
  });
});
