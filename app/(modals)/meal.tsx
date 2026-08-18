import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { MODAL_MAX_DETENT } from "~/modules/navigation/constants";
import { useDeclaredModalSheet } from "~/modules/navigation/modal-sheet";

import { MealScreen } from "~/modules/planning/meal-screen";

/**
 * One plate of the plan, open for editing — or an empty slot, open to be filled.
 *
 * The route owns the navigation and nothing else: it reads the params and hands the screen the
 * one thing it cannot know, which is how to dismiss itself. Which of the two shapes the params
 * carry is the screen's to decide, and validated there.
 */
export default function Meal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mealId?: string;
    date?: string;
    slot?: string;
    scope?: string;
  }>();

  /**
   * Stable, because the screen hands it to the chrome as the delete action's dismissal. Rebuilt
   * per render it would re-declare that action on every keystroke in the search box.
   */
  const close = useCallback(() => router.back(), [router]);

  /**
   * Declared, not measured: this screen is a search box over the whole catalogue, so its natural
   * height is however many recipes exist. It takes the tallest sheet and scrolls inside it.
   */
  useDeclaredModalSheet(MODAL_MAX_DETENT);

  return <MealScreen params={params} onClose={close} />;
}
