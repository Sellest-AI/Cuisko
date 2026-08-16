import { Stack } from "expo-router";

import { RecipeChrome } from "~/modules/recipe/chrome";

/**
 * A recipe's three tabs. Routing and chrome placement only — what the chrome shows is the
 * module's, not the route's.
 */
export default function RecipeLayout() {
  return (
    <RecipeChrome>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
    </RecipeChrome>
  );
}
