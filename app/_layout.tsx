import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "~/global/theme";
import { NavigationBar } from "~/modules/navigation/navigation-bar";
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
      <NavigationBar />
    </Providers>
  );
}
