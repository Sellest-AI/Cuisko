import { Stack, useLocalSearchParams } from "expo-router";

import { ExploreScreen } from "~/modules/explore/screen";
import { categoryParamOf } from "~/modules/explore/routes";

export default function Explore() {
  /** The tile picked: a cuisine the page offers, or none for the day's featured recipes. */
  const { category } = useLocalSearchParams<{ category?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <ExploreScreen cuisine={categoryParamOf(category)} />
    </>
  );
}
