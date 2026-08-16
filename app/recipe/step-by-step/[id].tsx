import { useRouter } from "expo-router";

import { StepByStepScreen } from "~/modules/recipe/step-by-step-screen";

/**
 * Cooking one recipe, step by step.
 *
 * A sibling of `[id]/` rather than a route inside it: everything under `recipe/[id]/` mounts into
 * the recipe chrome — the parallax photo, the tab bar — and this screen replaces both. A static
 * segment wins over a dynamic one, so `/recipe/step-by-step/<id>` never collides with a tab.
 *
 * The route owns the navigation and nothing else: it hands the screen the one thing it cannot
 * know, which is how to dismiss itself. The `id` lands here too, and will be read the day the
 * module fetches a real recipe with it.
 */
export default function StepByStep() {
  const router = useRouter();

  return <StepByStepScreen onClose={() => router.back()} />;
}
