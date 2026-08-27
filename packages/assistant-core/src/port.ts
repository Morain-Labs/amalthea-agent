import type {
  Adjustment,
  Household,
  InventoryItem,
  Preferences,
  PriceHint,
  Recipe,
  WeekPlan,
} from './types';

/**
 * The data plug. The host fills it: the demo app with a Firestore adapter,
 * the product app with its own server primitives. The port is constructed
 * server-side already scoped to one household, so nothing above it can name
 * another household's data. The tools layer is the only caller.
 */
export interface DataPort {
  getHousehold(): Promise<Household>;
  getInventory(): Promise<InventoryItem[]>;
  getRecipes(): Promise<Recipe[]>;
  getPriceHints(): Promise<PriceHint[]>;
  getCurrentPlan(): Promise<WeekPlan | null>;
  savePlan(plan: WeekPlan): Promise<void>;
  getPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<void>;
  listAdjustments(): Promise<Adjustment[]>;
  saveAdjustment(adjustment: Adjustment): Promise<void>;
}
