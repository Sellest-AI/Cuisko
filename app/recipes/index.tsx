import { Stack } from "expo-router";

import { RecipesScreen } from "~/modules/recipes/screen";

export default function Recipes() {
  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <RecipesScreen />
    </>
  );
}
