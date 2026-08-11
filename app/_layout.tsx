import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "~/modules/navigation/navigation-bar";
import { Providers } from "~/providers";

/**
 * Root layout: the provider tree and the navigator. Nothing else belongs here.
 *
 * Only the modal group is declared. Expo Router registers every other route on its own; this one
 * needs a line because presentation is a property of how the parent stack pushes it, and nothing
 * inside `(modals)` can ask to be presented as a sheet.
 */
export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
      <NavigationBar />
    </Providers>
  );
}
