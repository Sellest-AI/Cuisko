import { useLocalSearchParams, useRouter } from "expo-router";

import { StepByStepScreen } from "~/modules/recipes/step-by-step-screen";

/**
 * Cooking one recipe, step by step.
 *
 * A sibling of `[id]/` rather than a route inside it: everything under `recipe/[id]/` mounts into
 * the recipe chrome — the parallax photo, the tab bar — and this screen replaces both. A static
 * segment wins over a dynamic one, so `/recipe/step-by-step/<id>` never collides with a tab.
 *
 * The route owns the navigation and nothing else: it hands the screen the three things it cannot
 * know — which recipe it was opened for, how to dismiss itself, and where a cooked dish leads.
 *
 * Giving up goes back to wherever the recipe was opened from. Cooking does not: the write the
 * last tap sends moves the cellar, and the place to see that is the list with the cellar on top.
 * `dismissTo` pops back to the list when it is already behind the recipe, and replaces the modal
 * with it otherwise, so a cook never lands on the recipe they just finished.
 */
export default function StepByStep() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <StepByStepScreen
      id={id}
      onClose={() => router.back()}
      onCooked={() => router.dismissTo({ pathname: "/groceries", params: { section: "cellar" } })}
    />
  );
}
