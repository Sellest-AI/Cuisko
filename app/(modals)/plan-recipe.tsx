import { useLocalSearchParams, useRouter } from "expo-router";

import { PlanRecipeScreen } from "~/modules/planning/plan-recipe-screen";

/**
 * When, for how many, and at which meal a recipe gets cooked.
 *
 * The route owns the navigation and nothing else: it reads the param and hands the screen the one
 * thing it cannot know, which is where a planned dish leads. The sheet's height is the screen's to
 * set, not this route's — it changes shape between the day grid and the swap confirmation.
 *
 * A planned dish leads to the list: the write just put the missing ingredients on it, and that is
 * the promise the sheet's intro made. The sheet closes first, so going back from the list lands on
 * the recipe it was planned from.
 */
export default function PlanRecipe() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string }>();

  return (
    <PlanRecipeScreen
      params={params}
      onPlanned={() => {
        router.back();
        router.push("/groceries");
      }}
    />
  );
}
