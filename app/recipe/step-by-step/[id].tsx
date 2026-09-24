import { useLocalSearchParams, useNavigation, useRouter, type NativeStackNavigationProp } from "expo-router";

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
 *
 * The finish resets the root stack to home with the list on top, rather than navigating to the
 * list: the recipe is done, so every way back from the list (the bar's button, the Android back
 * key, the iOS swipe) should land on home, not on the recipe just cooked. One reset is also one
 * transition; popping to home and then pushing the list played two animations back to back.
 * Expo Router has no reset of its own, so this goes through React Navigation's, whose route names
 * are the root layout's files.
 */
type CookedStack = { index: undefined; groceries: { section: "cellar" } };

export default function StepByStep() {
  const router = useRouter();
  const navigation = useNavigation<NativeStackNavigationProp<CookedStack>>();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <StepByStepScreen
      id={id}
      onClose={() => router.back()}
      onCooked={() => navigation.reset({
        index: 1,
        routes: [{ name: "index" }, { name: "groceries", params: { section: "cellar" } }],
      })}
    />
  );
}
