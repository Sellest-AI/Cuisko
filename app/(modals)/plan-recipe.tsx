import { useLocalSearchParams, useRouter } from "expo-router";

import { PlanRecipeScreen } from "~/modules/planning/plan-recipe-screen";

/**
 * When, for how many, and at which meal a recipe gets cooked.
 *
 * The route owns the navigation and nothing else: it reads the param and hands the screen the one
 * thing it cannot know, which is where a planned dish leads. The sheet's height is the screen's to
 * set, not this route's — it changes shape between the day grid and the swap confirmation.
 *
 * A planned dish leads to the week, opened on the day it landed, so the cook sees the plate in
 * place rather than trusting that it went somewhere. The sheet closes first, so going back from
 * the week lands on the recipe it was planned from.
 */
export default function PlanRecipe() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string }>();

  return (
    <PlanRecipeScreen
      params={params}
      onPlanned={(date) => {
        router.back();
        router.push({ pathname: "/planning", params: { date } });
      }}
    />
  );
}
