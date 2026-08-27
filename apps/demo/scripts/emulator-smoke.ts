/**
 * Emulator smoke test: reads the seeded household back through the Firestore
 * adapter and round-trips a plan write. Needs the emulator running and the
 * seed applied. Not part of `npm test`, which stays pure.
 *
 *   npm run emulator                          (separate terminal)
 *   npm run seed --workspace @amalthea/demo
 *   npm run smoke --workspace @amalthea/demo
 */
import { createFirestorePort } from '../src/lib/firestore-port';
import { HOUSEHOLD_ID, inventory, recipes } from './seed-data';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'ok' : 'FAIL'}: ${label}`);
  if (!ok) process.exitCode = 1;
}

try {
  const port = createFirestorePort(HOUSEHOLD_ID);

  const household = await port.getHousehold();
  check('household is the Reyes family', household.name === 'Reyes family');
  check('four members', household.members.length === 4);
  check(
    'Ellis carries the peanut allergen',
    household.members.some((m) => m.name === 'Ellis' && m.allergens.includes('peanut')),
  );

  const storedInventory = await port.getInventory();
  check(`inventory count ${storedInventory.length}`, storedInventory.length === inventory.length);
  check(
    'inventory carries purchase dates',
    storedInventory.every((item) => typeof item.purchasedAt === 'string'),
  );

  const storedRecipes = await port.getRecipes();
  check(`recipe count ${storedRecipes.length}`, storedRecipes.length === recipes.length);

  const hints = await port.getPriceHints();
  check('price hints carry stores', hints.every((hint) => hint.store.length > 0));

  const plan = {
    id: 'smoke-plan',
    householdId: HOUSEHOLD_ID,
    meals: [{ day: 'monday' as const, recipeId: 'r-sheetpan-chicken' }],
    createdAt: new Date().toISOString(),
  };
  await port.savePlan(plan);
  const roundTrip = await port.getCurrentPlan();
  check('plan round-trips through the adapter', roundTrip?.id === 'smoke-plan');

  const preferences = await port.getPreferences();
  check('preferences default sanely', typeof preferences.answers === 'object');

  if (process.exitCode !== 1) console.log('SMOKE PASS');
  process.exit(process.exitCode ?? 0);
} catch (error) {
  console.error('Smoke failed. Emulator running? Seed applied?');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
