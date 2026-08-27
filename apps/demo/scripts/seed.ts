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
import { HOUSEHOLD_ID, materializeSeed } from './seed-data';

loadRootEnv();

if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.SEED_LIVE !== 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  console.log('FIRESTORE_EMULATOR_HOST not set, defaulting to 127.0.0.1:8080');
}

const db = getDb();
const root = db.collection('households').doc(HOUSEHOLD_ID);

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

  const seed = materializeSeed();
  const batch = db.batch();
  const { id: _householdId, ...householdDoc } = seed.household;
  batch.set(root, householdDoc);
  for (const item of seed.inventory) {
    const { id, ...rest } = item;
    batch.set(root.collection('inventory').doc(id), rest);
  }
  for (const recipe of seed.recipes) {
    const { id, ...rest } = recipe;
    batch.set(root.collection('recipes').doc(id), rest);
  }
  seed.priceHints.forEach((hint, index) => {
    batch.set(root.collection('priceHints').doc(`ph-${index}`), hint);
  });
  await batch.commit();

  console.log(
    `Seeded household ${HOUSEHOLD_ID}: ${seed.inventory.length} inventory items, ` +
      `${seed.recipes.length} recipes, ${seed.priceHints.length} price hints.`,
  );
  process.exit(0);
} catch (error) {
  console.error('Seed failed. Is the emulator running? Start it with: npm run emulator');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
