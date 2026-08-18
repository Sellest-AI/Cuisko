import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "~/global/theme";
import { NavigationBar } from "~/modules/navigation/navigation-bar";
import { Providers } from "~/providers";

/**
 * Root layout: the provider tree and the navigator. Nothing else belongs here.
 *
 * Only two routes are declared. Expo Router registers every other one on its own; these need a
 * line because presentation is a property of how the parent stack pushes a route, and nothing
 * inside `(modals)` — or inside the cooking screen — can ask to be presented over the app.
 */
export default function RootLayout() {
  return (
    <Providers>
      <StatusBar style="dark" />
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
      </Stack>
      <NavigationBar />
    </Providers>
  );
}
