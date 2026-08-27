/**
 * Seeds the demo household into Firestore. Targets the local emulator by
 * default: it refuses to touch live Firestore unless SEED_LIVE=true is set
 * explicitly, so a stray run can never write to a real project.
 *
 *   npm run emulator          (separate terminal, keeps running)
 *   npm run seed --workspace @amalthea/demo
 */
import { getDb } from '../src/lib/firestore-port';
import { loadRootEnv } from '../src/lib/env';
import { HOUSEHOLD_ID, household, inventory, priceHints, recipes } from './seed-data';

loadRootEnv();

if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.SEED_LIVE !== 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  console.log('FIRESTORE_EMULATOR_HOST not set, defaulting to 127.0.0.1:8080');
}

const db = getDb();
const root = db.collection('households').doc(HOUSEHOLD_ID);

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function clearCollection(name: string): Promise<void> {
  const snapshot = await root.collection(name).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  for (const doc of snapshot.docs) batch.delete(doc.ref);
  await batch.commit();
}

try {
  for (const name of ['inventory', 'recipes', 'priceHints', 'plans', 'meta', 'adjustments']) {
    await clearCollection(name);
  }

  const batch = db.batch();
  batch.set(root, household);
  for (const item of inventory) {
    const { id, purchasedDaysAgo, ...rest } = item;
    batch.set(root.collection('inventory').doc(id), {
      ...rest,
      purchasedAt: daysAgoIso(purchasedDaysAgo),
    });
  }
  for (const recipe of recipes) {
    const { id, ...rest } = recipe;
    batch.set(root.collection('recipes').doc(id), rest);
  }
  priceHints.forEach((hint, index) => {
    const { seenDaysAgo, ...rest } = hint;
    batch.set(root.collection('priceHints').doc(`ph-${index}`), {
      ...rest,
      seenAt: daysAgoIso(seenDaysAgo),
    });
  });
  await batch.commit();

  console.log(
    `Seeded household ${HOUSEHOLD_ID}: ${inventory.length} inventory items, ` +
      `${recipes.length} recipes, ${priceHints.length} price hints.`,
  );
  process.exit(0);
} catch (error) {
  console.error('Seed failed. Is the emulator running? Start it with: npm run emulator');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
