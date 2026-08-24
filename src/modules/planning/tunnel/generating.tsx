import { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Image } from "@ui/image";
import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { generatedMeals, MASCOT, MEAL_IMAGE, TILE_IMAGE } from "../_hooks/placeholders";
import { useTunnel } from "../_hooks/useTunnel";

/** Dishes the fake generation reports, and how long each one takes to "cook". */
const DISHES = 3;
const DISH_MS = 900;

/** Where the plates drift, as a fraction of the screen. Two above the mascot, three below. */
const DRIFTING_PLATES = [
  { at: { top: "3%", left: "38%" }, size: 96, delay: 0 },
  { at: { top: "16%", left: "8%" }, size: 86, delay: 400 },
  { at: { top: "14%", right: "10%" }, size: 64, delay: 800 },
  { at: { bottom: "19%", left: "14%" }, size: 64, delay: 200 },
  { at: { bottom: "20%", right: "12%" }, size: 72, delay: 600 },
  { at: { bottom: "8%", left: "38%" }, size: 96, delay: 1000 },
] as const;

const PLATE_IMAGES = [MEAL_IMAGE, TILE_IMAGE];
const MASCOT_SIZE = 140;
const DRIFT = 12;
const DRIFT_MS = 800;
const FADE_MS = 400;

type PlateSpot = (typeof DRIFTING_PLATES)[number];

/**
 * One plate, bobbing forever.
 *
 * Memoised, and that is the whole point: Moti rebuilds its animated style whenever `from`,
 * `animate` or `transition` change identity, and object literals in a parent's JSX change identity
 * on every render. The counter above re-renders once a second, which restarted each loop from the
 * value it had already reached — a ping-pong between `DRIFT` and `DRIFT`, i.e. a frozen plate after
 * the first drift down. Isolating the plate means the counter's renders never reach it.
 */
const DriftingPlate = memo(({ plate, image }: { plate: PlateSpot; image: (typeof PLATE_IMAGES)[number] }) => (
  <m.View
    style={[styles.plate, plate.at]}
    from={{ translateY: -DRIFT, opacity: 0 }}
    animate={{ translateY: DRIFT, opacity: 1 }}
    transition={{
      translateY: {
        type: "timing",
        duration: DRIFT_MS,
        loop: true,
        repeatReverse: true,
        delay: plate.delay,
      },
      opacity: { type: "timing", duration: FADE_MS, delay: plate.delay },
    }}
  >
    <Image
      source={image}
      contentFit="contain"
      style={{ width: plate.size, height: plate.size }}
    />
  </m.View>
));

DriftingPlate.displayName = "DriftingPlate";

/**
 * Step 3 — the wait, made legible.
 *
 * A counter rather than a spinner: "2 of 3 dishes" says the work is finite and how far in it is,
 * where a spinner only says something is happening. The timer is fake, and the count is the shape
 * a real generation's progress will report.
 */
export const TunnelGenerating = () => {
  const t = useTranslations("Planning");
  const { next, setMeals, days, slots } = useTunnel();
  const [cooked, setCooked] = useState(0);

  /** Stops once the last dish lands, rather than ticking on against a value that cannot move. */
  useEffect(() => {
    if (cooked >= DISHES) return;

    const timer = setInterval(() => setCooked((count) => Math.min(count + 1, DISHES)), DISH_MS);

    return () => clearInterval(timer);
  }, [cooked]);

  useEffect(() => {
    if (cooked < DISHES) return;

    setMeals(generatedMeals(new Date(), days, slots));

    /** A beat on the full count, so the last dish is seen landing rather than skipped past. */
    const timer = setTimeout(next, DISH_MS);

    return () => clearTimeout(timer);
  }, [cooked, next, setMeals, days, slots]);

  return (
    <View style={styles.page}>
      {DRIFTING_PLATES.map((plate, index) => (
        <DriftingPlate key={index} plate={plate} image={PLATE_IMAGES[index % PLATE_IMAGES.length]} />
      ))}
      <View style={styles.centre}>
        <Image source={MASCOT} contentFit="contain" style={styles.mascot} />
        <Text.H4 style={styles.title}>{t("Tunnel.Generating.title")}</Text.H4>
        <Text.Lg color={colors.muted} style={styles.subtitle}>
          {t("Tunnel.Generating.subtitle")}
        </Text.Lg>
        <View style={styles.progress}>
          <View style={styles.count}>
            <Text.Base weight={700} color={colors.primary.base}>
              {cooked}
            </Text.Base>
            <Text.Base weight={700} color={colors.primary.elevated}>
              / {DISHES}
            </Text.Base>
          </View>
          <Text.Lg
            color={colors.primary.elevated}
            style={{ textTransform: "capitalize" }}
            weight={700}
          >
            {t("Tunnel.Generating.progress")}
          </Text.Lg>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center" },
  plate: { position: "absolute" },
  centre: {
    alignItems: "center",
    paddingHorizontal: theme.spacing[24],
    marginTop: -20,
  },
  mascot: { width: MASCOT_SIZE, height: MASCOT_SIZE },
  title: { marginTop: theme.spacing[16], textAlign: "center" },
  subtitle: { marginTop: theme.spacing[8], textAlign: "center" },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    marginTop: theme.spacing[24],
  },
  count: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.elevated,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
  },
});
