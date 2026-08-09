import { Stack } from "expo-router";

import { HomeScreen } from "~/modules/home/screen";
import { NavigationBar } from "~/modules/navigation/navigation-bar";

/**
 * Routing only — screen options and module components. No data access lives here (ADR 0006);
 * lint R4 enforces it.
 *
 * The route composes the bar beside the screen rather than the screen owning it: the bar spans
 * pages, and a route that should not show one simply does not render it.
 */
export default function Home() {
  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <HomeScreen />
      <NavigationBar />
    </>
  );
}
