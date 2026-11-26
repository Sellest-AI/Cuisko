import { Stack, useLocalSearchParams } from "expo-router";

import { RecipesScreen } from "~/modules/recipes/list-screen";

export default function Recipes() {
  /** What the navigation bar submitted, when a cook reached this page by naming a dish in it. */
  const { q, focus } = useLocalSearchParams<{ q?: string; focus?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      {/* `focus=search` when the cook came from the Explore page's search box (`recipesRoute`). */}
      <RecipesScreen initialQuery={q} initialFocus={focus === "search"} />
    </>
  );
}
