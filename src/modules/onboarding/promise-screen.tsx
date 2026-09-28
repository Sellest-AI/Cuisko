import { useEffect } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { StepHeader } from "@ui/step-header";
import { useTranslations } from "translations";

import { CUISKO } from "~/lib/mascots";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { PromiseWall, type PromiseTone } from "./_components/promise-wall";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useProgressClearance } from "./_hooks/useProgressClearance";

/**
 * What the app does for you, one chip each, four rows. Only what the app really does, each one a
 * line of PRODUCT.md: cooking from the cellar, buying only what is missing, the week in one tap.
 */
const PROMISE_ROWS = [
  [
    { id: "from_cellar", emoji: "🥕", tone: "plain" },
    { id: "spend_less", emoji: "💶", tone: "secondary" },
    { id: "week_one_tap", emoji: "📅", tone: "primary" },
    { id: "cellar_updates", emoji: "📦", tone: "plain" },
  ],
  [
    { id: "swap", emoji: "🔀", tone: "plain" },
    { id: "only_missing", emoji: "🛒", tone: "primary" },
    { id: "allergies", emoji: "🥜", tone: "plain" },
    { id: "type_it", emoji: "🧾", tone: "primary" },
  ],
  [
    { id: "step_by_step", emoji: "🍳", tone: "plain" },
    { id: "import", emoji: "🌍", tone: "primary" },
    { id: "waste_less", emoji: "♻️", tone: "secondary" },
    { id: "fits_evening", emoji: "⏱️", tone: "plain" },
  ],
] as const satisfies readonly (readonly { id: string; emoji: string; tone: PromiseTone }[])[];

/**
 * Screen 1: what the app gives back, before it asks for anything.
 *
 * Cuisko and the one-line promise, then everything it stands on as a slow wall of chips. The one
 * figure is the subtitle's, what cooks save on average (measured by the team, 2026-09-28): never a
 * saving of this user's, who owns nothing yet.
 */
export const OnboardingPromise = () => {
  const t = useTranslations("Onboarding");
  const { restart } = useOnboarding();
  const clearance = useProgressClearance();

  /** Entering the first step starts a walk through, so the last one's done actions go now. */
  useEffect(() => restart(), [restart]);

  const rows = PROMISE_ROWS.map((row) => row.map((chip) => ({ ...chip, label: t(`Promise.Chips.${chip.id}`) })));

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingTop: clearance }]} showsVerticalScrollIndicator={false}>
      <StepHeader title={t("Promise.title")} subtitle={t("Promise.subtitle")} mascot={CUISKO.fish} />
      <PromiseWall rows={rows} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  /** Clears the pill, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
});
