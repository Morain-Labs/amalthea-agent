import { createTools } from '@amalthea/assistant-core';
import { createFirestorePort } from '@/lib/firestore-port';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The kitchen panel's data: pantry, current plan, grocery list, household.
 * Pantry and list come from the same tool handlers the model presses, so
 * the panel always shows exactly what the assistant sees.
 */
export async function GET(): Promise<Response> {
  const port = createFirestorePort();
  const tools = createTools(port);
  const call = async (name: string): Promise<unknown> => {
    const tool = tools.find((candidate) => candidate.name === name);
    return tool ? tool.execute({}) : undefined;
  };

  try {
    const [household, pantry, plan, recipes] = await Promise.all([
      port.getHousehold(),
      call('get_pantry'),
      port.getCurrentPlan(),
      port.getRecipes(),
    ]);

    const titles = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
    const planView = plan
      ? {
          meals: plan.meals.map((meal) => ({
            day: meal.day,
            title: titles.get(meal.recipeId) ?? meal.recipeId,
            pinned: meal.pinned ?? false,
            note: meal.note,
          })),
        }
      : null;

    const groceryList = plan ? await call('build_grocery_list') : null;

    return Response.json({
      household: {
        name: household.name,
        weeklyBudget: household.weeklyBudget,
        members: household.members,
      },
      pantry,
      plan: planView,
      groceryList,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'state unavailable, is the emulator seeded?',
      },
      { status: 503 },
    );
  }
}
