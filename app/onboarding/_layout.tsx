import { Stack } from "expo-router";

import { OnboardingChrome } from "~/modules/onboarding/chrome";

/**
 * Where the stack starts when something resets to the group by name rather than by path, as the
 * auth gate does after a sign-in: the promise, whatever order the files happen to register in.
 */
export const unstable_settings = { initialRouteName: "promise" };

/**
 * The onboarding. Routing and chrome placement only — what the chrome says at each step is the
 * module's, not the route's.
 */
export default function OnboardingLayout() {
  return (
    <OnboardingChrome>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          // Forward only: no swipe back between steps (see `OnboardingChrome`).
          gestureEnabled: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </OnboardingChrome>
  );
}
