import type {
  Adjustment,
  DataPort,
  Household,
  InventoryItem,
  Member,
  Preferences,
  PriceHint,
  Recipe,
  WeekPlan,
} from '@amalthea/assistant-core';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * The Firestore adapter: the demo's implementation of the data plug. Locally
 * it talks to the emulator (FIRESTORE_EMULATOR_HOST), deployed it talks to
 * live Firestore with Application Default Credentials. The adapter is
 * constructed server-side scoped to one household, so callers above it can
 * never name another household's data.
 */
export function getDb(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      projectId:
        process.env.GOOGLE_CLOUD_PROJECT ??
        process.env.FIRESTORE_PROJECT_ID ??
        'demo-amalthea',
    });
  }
  const db = getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() throws if called twice on the same instance. Fine.
  }
  return db;
}

export const DEFAULT_HOUSEHOLD_ID = 'reyes-demo';

interface HouseholdDoc {
  name: string;
  weeklyBudget: number;
  members: Member[];
}

export function createFirestorePort(
  householdId: string = process.env.DEMO_HOUSEHOLD_ID ?? DEFAULT_HOUSEHOLD_ID,
): DataPort {
  const db = getDb();
  const root = db.collection('households').doc(householdId);

  return {
    async getHousehold(): Promise<Household> {
      const snapshot = await root.get();
      if (!snapshot.exists) {
        throw new Error(`household ${householdId} is not seeded. Run: npm run seed`);
      }
      const data = snapshot.data() as HouseholdDoc;
      return { id: householdId, ...data };
    },

    async getInventory(): Promise<InventoryItem[]> {
      const snapshot = await root.collection('inventory').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as InventoryItem);
    },

    async getRecipes(): Promise<Recipe[]> {
      const snapshot = await root.collection('recipes').get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Recipe);
    },

    async getPriceHints(): Promise<PriceHint[]> {
      const snapshot = await root.collection('priceHints').get();
      return snapshot.docs.map((doc) => doc.data() as PriceHint);
    },

    async getCurrentPlan(): Promise<WeekPlan | null> {
      const snapshot = await root.collection('plans').doc('current').get();
      return snapshot.exists ? (snapshot.data() as WeekPlan) : null;
    },

    async savePlan(plan: WeekPlan): Promise<void> {
      await root.collection('plans').doc('current').set(plan);
    },

    async getPreferences(): Promise<Preferences> {
      const snapshot = await root.collection('meta').doc('preferences').get();
      return snapshot.exists ? (snapshot.data() as Preferences) : { answers: {} };
    },

    async savePreferences(preferences: Preferences): Promise<void> {
      await root.collection('meta').doc('preferences').set(preferences);
    },

    async listAdjustments(): Promise<Adjustment[]> {
      const snapshot = await root.collection('adjustments').orderBy('createdAt').get();
      return snapshot.docs.map((doc) => doc.data() as Adjustment);
    },

    async saveAdjustment(adjustment: Adjustment): Promise<void> {
      await root.collection('adjustments').doc(adjustment.id).set(adjustment);
    },
  };
}
