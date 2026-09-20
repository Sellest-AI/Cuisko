import { Stack, useLocalSearchParams } from "expo-router";

import { RecipesScreen } from "~/modules/recipes/list-screen";

export default function Recipes() {
  /** What the navigation bar submitted, when a cook reached this page by naming a dish in it. */
  const { q } = useLocalSearchParams<{ q?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <RecipesScreen initialQuery={q} />
    </>
  );
}
