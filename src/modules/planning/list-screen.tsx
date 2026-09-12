import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { useState } from "react";

import { SafeAreaView, useSafeAreaInsets } from "@ui/safe-area-view";
import { ActionRow } from "@ui/action-row";
import { CalendarIcon, CalendarPlus, Loader, SlidersHorizontal } from "@ui/icons";
import { Image } from "@ui/image";
import { Button } from "@ui/button";
import { AnimatePresence, m } from "@ui/motion";
import { RadialGradient } from "@ui/radial-gradient";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { MEAL_IMAGE } from "./_hooks/placeholders";
import { usePlanningList } from "./_hooks/usePlanningList";
import { PlanningListRow } from "./_components/planning-row";
import { toDateParam, type PlanningRow } from "./_model/model";

type Props = {
  /** The day to open on as `YYYY-MM-DD`, straight off the route — validated by the hook. */
  focusDate?: string;
};

const HEADER_ICON_SIZE = 26;

/**
 * The sheet for that row: the plate it holds, or the day and slot it is waiting for.
 *
 * An empty row has no plate to name, so it names its slot instead — the sheet mints the plate on
 * the day and slot the link carried, which is what makes an untouched slot fillable at all. No
 * `scope`, so the sheet edits the plan itself: this list *is* the week being kept.
 */
const _openPlate = (row: PlanningRow) =>
  router.push(row.kind === "meal"
    ? { pathname: "/meal", params: { mealId: row.meal.id } }
    : { pathname: "/meal", params: { date: toDateParam(row.date), slot: row.slot } });

/**
 * Planning: the week as a list, scrollable back through what was cooked and on into what is not
 * planned yet.
 *
 * A list rather than the home carousel because this is the screen for seeing the *shape* of a week
 * — PRODUCT.md's weekly beat asks for "seeing the whole week", which a carousel showing one plate
 * at a time cannot answer.
 */
export const PlanningScreen = ({ focusDate }: Props) => {
  const t = useTranslations("Planning");
  const { rows, initialIndex } = usePlanningList(focusDate);

  const { top } = useSafeAreaInsets()

  const [show, setShow] = useState(false);

  return (
    <>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[theme.colors.neutral.subtle, theme.colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <RadialGradient
        size={400}
        colors={[theme.colors.primary.base, theme.colors.neutral.subtle]}
        style={{ position: "absolute", bottom: -150, left: -150, opacity: 0.1 }}
      />
      <SafeAreaView
        style={styles.header}
        edges={{ top: "additive", bottom: "off" }}
      >
        <View style={styles.title}>
          <CalendarIcon size={HEADER_ICON_SIZE} />
          <Text.H4>{t("Screen.title")}</Text.H4>
        </View>
        <Button
          variant="neutral"
          leftIcon={SlidersHorizontal}
          onPress={() => router.push("/preferences")}
        >
          {t("Screen.preferences")}
        </Button>
      </SafeAreaView>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.id}
        /**
         * The list opens on the day it was asked for rather than at the top: arriving from a tap on
         * a specific day and landing six days behind it is a scroll the user did not ask for.
         */
        initialScrollIndex={initialIndex - 1}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onLoad={() => requestAnimationFrame(() => setShow(true))}
        style={{
          marginTop: -60 - top,
          opacity: show ? 1 : 0,
        }}
        renderItem={({ item, index }) => {
          const isNextSameDay = rows[index + 1]?.date.getDate() === item.date.getDate();
          const isLast = index === rows.length - 1;

          return (
            <PlanningListRow
              row={item}
              onPress={() => {
                if (item.kind === "empty") return _openPlate(item);
                router.push(`/recipe/${item.meal.recipeId}`);
              }}
              onTrailingPress={() => _openPlate(item)}
              style={{
                marginBottom: isLast ? theme.spacing[12] :
                  isNextSameDay ? theme.spacing[8] : theme.spacing[32]
              }}
            />
          )
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <ActionRow
              variant="primary"
              style={{ alignSelf: "center" }}
              onPress={() => router.push("/planning/new/setup")}
              content={t("Screen.plan_next_days")}
              contentIcon={CalendarPlus}
              subtitle={t("Screen.plan_next_days_subtitle")}
              leftContent={<View style={{ width: FOOTER_PLATE_SIZE + 12, aspectRatio: 1, position: "relative" }}>
                <Image source={MEAL_IMAGE} style={[styles.footerPlate, { top: -12, left: 0 }]} contentFit="contain" />
                <Image source={MEAL_IMAGE} style={[styles.footerPlate, { bottom: -8, right: -6 }]} contentFit="contain" />
              </View>}
            />
            <Button
              variant="neutral"
              leftIcon={SlidersHorizontal}
              onPress={() => router.push("/preferences")}
              style={styles.footerPill}
            >
              {t("Screen.update_preferences")}
            </Button>
          </View>
        }
      />
      <AnimatePresence>
        {!show && <m.View
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          exitTransition={{ duration: 200 }}
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: "center", alignItems: "center" },
            { backgroundColor: theme.colors.background }
          ]}>
          <Loader color={theme.colors.primary.base} />
        </m.View>}
      </AnimatePresence>
      <LinearGradient
        colors={[theme.colors.neutral.subtle, theme.colors.transparent.light]}
        style={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 128,
        }}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
    </>
  );
};

const FOOTER_PLATE_SIZE = 64;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: theme.spacing[24],
    paddingRight: theme.spacing[16],
    paddingTop: Platform.select({ android: theme.spacing[8], default: theme.spacing[16] }),
    paddingBottom: theme.spacing[12],
    zIndex: 1,
  },
  title: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  /** Clears the navigation bar, which floats over the page rather than sitting in it. */
  list: {
    paddingBottom: NAVIGATION_BAR_OFFSET,
    paddingHorizontal: theme.spacing[12],
    paddingTop: Platform.select({
      android: 112,
      ios: 128,
      default: 72
    }),
  },
  footer: {
    alignItems: "center",
    gap: theme.spacing[20],
    marginTop: theme.spacing[28],
    paddingHorizontal: theme.spacing[16],
  },
  footerPlate: { width: FOOTER_PLATE_SIZE, height: FOOTER_PLATE_SIZE, position: "absolute" },
  footerPill: { alignSelf: "center" },
});
