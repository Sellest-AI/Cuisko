import { useLocalSearchParams, useRouter } from "expo-router";

import { PlanRecipeScreen } from "~/modules/planning/plan-recipe-screen";

/**
 * When, for how many, and at which meal a recipe gets cooked.
 *
 * The route owns the navigation and nothing else: it reads the param and hands the screen the one
 * thing it cannot know, which is how to dismiss itself. The sheet's height is the screen's to set,
 * not this route's — it changes shape between the day grid and the swap confirmation.
 */
export default function PlanRecipe() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string }>();

  return <PlanRecipeScreen params={params} onClose={() => router.back()} />;
}
