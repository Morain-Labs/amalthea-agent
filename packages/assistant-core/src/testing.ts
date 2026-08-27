import type { DataPort } from './port';
import type {
  Adjustment,
  Household,
  InventoryItem,
  Preferences,
  PriceHint,
  Recipe,
  WeekPlan,
} from './types';

export interface InMemorySeed {
  household: Household;
  inventory?: InventoryItem[];
  recipes?: Recipe[];
  priceHints?: PriceHint[];
  plan?: WeekPlan | null;
  preferences?: Preferences;
  adjustments?: Adjustment[];
}

/**
 * A DataPort backed by plain objects, for tests and prototypes. The demo's
 * Firestore adapter and the app's server primitives implement the same
 * interface against real storage.
 */
export function createInMemoryPort(seed: InMemorySeed): DataPort & {
  state: Required<Omit<InMemorySeed, 'household'>> & { household: Household };
} {
  const state = {
    household: seed.household,
    inventory: seed.inventory ?? [],
    recipes: seed.recipes ?? [],
    priceHints: seed.priceHints ?? [],
    plan: seed.plan ?? null,
    preferences: seed.preferences ?? { answers: {} },
    adjustments: seed.adjustments ?? [],
  };
  return {
    state,
    getHousehold: async () => state.household,
    getInventory: async () => [...state.inventory],
    getRecipes: async () => [...state.recipes],
    getPriceHints: async () => [...state.priceHints],
    getCurrentPlan: async () => state.plan,
    savePlan: async (plan) => {
      state.plan = plan;
    },
    getPreferences: async () => state.preferences,
    savePreferences: async (preferences) => {
      state.preferences = preferences;
    },
    listAdjustments: async () => [...state.adjustments],
    saveAdjustment: async (adjustment) => {
      state.adjustments.push(adjustment);
    },
  };
}
