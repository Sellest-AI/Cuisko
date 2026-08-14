import { Stack } from "expo-router";

import { TunnelChrome } from "~/modules/planning/tunnel/chrome";

/**
 * The generation tunnel. Routing and chrome placement only — what the chrome *says* at each step
 * is the module's, not the route's.
 */
export default function TunnelLayout() {
  return (
    <TunnelChrome>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </TunnelChrome>
  );
}
