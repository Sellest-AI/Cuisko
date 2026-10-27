import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { BlurScope, BlurTarget } from "@ui/blur-view";
import { useBlurTarget } from "@ui/hooks/useBlurTarget";
import { theme } from "~/global/theme";
import { AnalyticsTracking } from "~/modules/auth/analytics-tracking";
import { AuthGate } from "~/modules/auth/auth-gate";
import { RestartOnSignOut } from "~/modules/auth/restart-on-sign-out";
import { HouseholdAtomsReset } from "~/modules/households/household-atoms-reset";
import { NavigationBar } from "~/modules/navigation/navigation-bar";
import { OfflineGate } from "~/modules/network/offline-gate";
import { ShareIntentListener } from "~/modules/recipes/share-intent-listener";
import { Providers } from "~/providers";

/**
 * Root layout: the provider tree and the navigator. Nothing else belongs here.
 *
 * Expo Router registers every route on its own; the ones named below need a line anyway, because
 * presentation is a property of how the *parent* stack pushes a route. A screen cannot ask to be
 * presented over the app from inside itself, so anything that covers the app — `(modals)`, the
 * cooking screen, the editor — is spelled out here.
 */
export default function RootLayout() {
  /**
   * The bar floats over whichever page is up and frosts it. Android has to be told what "it" is,
   * so the navigator is the target and the bar the scope — which is also why the bar sits beside
   * the navigator rather than inside any screen (see `NavigationBar`).
   */
  const page = useBlurTarget();

  return (
    <Providers>
      <StatusBar style="dark" />
      <BlurTarget target={page} style={styles.page}>
        <Stack screenOptions={{
          headerShown: false,
          animation: "simple_push",
          contentStyle: {
            backgroundColor: theme.colors.background,
          }
        }}
        >
          <Stack.Screen
            name="groceries"
            options={{
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="recipes"
            options={{
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="(modals)"
            options={{
              presentation: "formSheet",
              /**
               * `fitToContents`, and the height comes from `(modals)/_layout.tsx` instead of from a
               * detent here. Android reads a numeric detent once, at fragment creation, and never
               * again — this is the only presentation it will resize a live sheet through. See
               * `useModalSheetFrameHeight`.
               */
              sheetAllowedDetents: "fitToContents",
              sheetCornerRadius: 24,
              sheetGrabberVisible: false,
              contentStyle: {
                backgroundColor: theme.colors.background,
              }
            }}
          />
          {/*
            * The account drawer draws over the page it was opened from, which stays visible to
            * the right of it. Transparent, so that page is still there to see; no native slide,
            * because the drawer slides its own panel in from the left and fades its own backdrop.
            */}
          <Stack.Screen
            name="account"
            options={{
              presentation: "transparentModal",
              animation: "none",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          {/*
            * Cooking covers the app rather than sitting inside it: hands are busy, and a back
            * gesture or a bar edge caught mid-step is a lost place in the method.
            */}
          <Stack.Screen
            name="recipe/step-by-step/[id]"
            options={{
              presentation: "fullScreenModal",
              animation: "slide_from_bottom"
            }}
          />
          {/*
            * Writing a recipe covers the app for the same reason cooking does: it is a task with its
            * own beginning and end, and a half-typed recipe is worth more than the page behind it.
            *
            * Declared here rather than under a `recipe/_layout.tsx`, because a layout on that segment
            * would nest `step-by-step` inside it too and take that screen's presentation away.
            */}
          <Stack.Screen
            name="recipe/new"
            options={{
              animation: "slide_from_bottom"
            }}
          />
          <Stack.Screen
            name="recipe/edit/[id]"
            options={{
              animation: "slide_from_bottom"
            }}
          />
        </Stack>
      </BlurTarget>
      <BlurScope target={page}>
        <NavigationBar />
      </BlurScope>
      {/* Beside the navigator rather than in a screen: a switch can happen from any of them. */}
      <HouseholdAtomsReset />
      {/* Beside the navigator too: a link shared from another app can arrive on any screen. */}
      <ShareIntentListener />
      {/* Analytics follows the signed-in cook and the route, whichever screen is up. */}
      <AnalyticsTracking />
      {/* After everything else, so its cover draws over the bar and the page as well. */}
      <AuthGate />
      {/* After the auth gate: it waits for that gate to settle on a session before it sends anyone offline. */}
      <OfflineGate />
      {/* Last of all: a session can end on any screen, and its cover draws over the gate's sign-in. */}
      <RestartOnSignOut />
    </Providers>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
