import { useLocalSearchParams, useRouter } from "expo-router";

import { StepByStepScreen } from "~/modules/recipes/step-by-step-screen";

/**
 * Cooking one recipe, step by step.
 *
 * A sibling of `[id]/` rather than a route inside it: everything under `recipe/[id]/` mounts into
 * the recipe chrome — the parallax photo, the tab bar — and this screen replaces both. A static
 * segment wins over a dynamic one, so `/recipe/step-by-step/<id>` never collides with a tab.
 *
 * The route owns the navigation and nothing else: it hands the screen the two things it cannot
 * know — which recipe it was opened for, and how to dismiss itself.
 */
export default function StepByStep() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <StepByStepScreen id={id} onClose={() => router.back()} />;
}
