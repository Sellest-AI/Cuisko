import { FlashList, type FlashListProps } from "@shopify/flash-list";
import { router } from "expo-router";
import { type ComponentType, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";

import { CalendarIcon } from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import {
  buildRows,
  planDates,
  planSections,
  toDateParam,
  type PlanningRow,
} from "../_model/model";
import { useTunnel } from "./_hooks/useTunnel";
import { useTunnelScrollHandler } from "./_hooks/useTunnelScrollHandler";
import { PlanningListRow } from "../_components/planning-row";
import { TunnelHeader } from "./_components/tunnel-header";

/** FlashList is generic; the animated wrapper needs a concrete props type to attach `onScroll`. */
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<FlashListProps<PlanningRow>>,
);

/**
 * The sheet for that row: the plate it holds, or the day and slot it is waiting for.
 *
 * The empty row carries no plate to name, so the slot names itself instead — which is what lets a
 * plate the user dropped be put back on the day it was dropped from.
 *
 * `scope: draft` because this list is the generated week, which the user has not accepted yet —
 * without it the sheet would edit the plan they are already keeping, and a tunnel abandoned
 * halfway would have changed it anyway.
 */
const _openPlate = (row: PlanningRow) =>
  router.push(row.kind === "meal"
    ? { pathname: "/meal", params: { mealId: row.meal.id, scope: "draft" } }
    : {
      pathname: "/meal",
      params: { date: toDateParam(row.date), slot: row.slot, scope: "draft" },
    });

/** Step 4 — what it picked, before the list is drawn from it. */
export const TunnelReview = () => {
  const t = useTranslations("Planning");
  const { meals, slots, days } = useTunnel();
  const onScroll = useTunnelScrollHandler();

  const today = useMemo(() => new Date(), []);

  /**
   * The days the tunnel was asked for, whichever of them still hold a plate, with an empty one on
   * every slot that does not. Deleting is otherwise a one-way door: the row goes, and with it the
   * only thing there was to tap.
   */
  const rows = useMemo(
    () => buildRows(planSections(planDates(today, days), meals, today), today, { emptySlots: slots }),
    [today, days, meals, slots],
  );

  return (
    <AnimatedFlashList
      onScroll={onScroll}
      scrollEventThrottle={16}
      data={rows}
      keyExtractor={(row) => row.id}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <TunnelHeader
          title={t("Tunnel.Review.title")}
          subtitle={t("Tunnel.Review.subtitle")}
          icon={CalendarIcon}
        />
      }
      renderItem={({ item, index }) => {
        const isNextSameDay = rows[index + 1]?.date.getDate() === item.date.getDate();
        const isLast = index === rows.length - 1;

        return (
          <PlanningListRow
            row={item}
            variant="review"
            onPress={() => _openPlate(item)}
            onTrailingPress={() => _openPlate(item)}
            style={{
              marginBottom: isLast ? theme.spacing[12] :
                isNextSameDay ? theme.spacing[8] : theme.spacing[32]
            }}
          />
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  /** Clears the tunnel bar, which floats over the page rather than sitting in it. */
  page: {
    paddingBottom: NAVIGATION_BAR_OFFSET,
    paddingHorizontal: theme.spacing[12]
  },
});
