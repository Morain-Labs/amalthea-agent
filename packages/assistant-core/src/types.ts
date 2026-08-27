/**
 * Domain types for the brain. Persistence-free: these are the shapes the data
 * port serves and the tools operate on, wherever they are stored.
 */

export interface Member {
  id: string;
  name: string;
  age?: number;
  /** Canonical allergen ids from the allergen table, e.g. 'peanut'. */
  allergens: string[];
}

export interface Household {
  id: string;
  name: string;
  /** Weekly grocery budget in dollars. */
  weeklyBudget: number;
  members: Member[];
}

export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: StorageLocation;
  /** ISO date the item was purchased, when known. */
  purchasedAt?: string;
  /** Estimated days from purchase to expiry. User-overridable. */
  shelfLifeDays?: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: RecipeIngredient[];
  /** Canonical allergen ids declared present in this recipe. */
  allergens: string[];
  /** Free-form tags, e.g. 'taco-night', 'vegetarian', 'quick'. */
  tags: string[];
  /** Rough whole-recipe cost in dollars, for budget fitting. */
  estimatedCost: number;
  servings: number;
}

export interface PriceHint {
  itemName: string;
  store: string;
  /** Price in dollars for the given unit. */
  price: number;
  unit: string;
  /** ISO date the price was last seen. */
  seenAt: string;
}

export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Day = (typeof DAYS)[number];

export interface PlannedMeal {
  day: Day;
  recipeId: string;
  pinned?: boolean;
  note?: string;
}

export interface WeekPlan {
  id: string;
  householdId: string;
  meals: PlannedMeal[];
  createdAt: string;
}

export interface Preferences {
  /** Interview answers, persisted verbatim under stable question ids. */
  answers: Record<string, string>;
  /** Nights the household does not cook, e.g. ['thursday']. */
  busyNights?: Day[];
}

export interface Adjustment {
  id: string;
  /** The recipe the note is about, when it is about one. */
  recipeId?: string;
  note: string;
  createdAt: string;
}

export interface GroceryLine {
  name: string;
  quantity: number;
  unit: string;
  /** Cheapest known price hint for this line, when one matches. */
  bestPrice?: { store: string; price: number; unit: string };
}
