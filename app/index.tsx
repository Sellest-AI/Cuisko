import { Stack } from "expo-router";

import { AuthScreen } from "~/modules/auth/screen";

/**
 * Routing only — screen options and one module component. No data access lives here (ADR 0006);
 * lint R4 enforces it.
 */
export default function Index() {
  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <AuthScreen />
    </>
  );
}
