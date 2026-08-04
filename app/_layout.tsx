import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { Providers } from "~/providers";

/**
 * Root layout: the provider tree and the navigator. Nothing else belongs here.
 */
export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </Providers>
  );
}
