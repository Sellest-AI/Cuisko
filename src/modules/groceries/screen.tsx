import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { GroceryGrid } from "./screen.grid";

import { ReceiptTextIcon } from "@ui/icons";
import { RadialGradient } from "@ui/radial-gradient";
import { Select } from "@ui/select";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

/** Placeholder until lists come from Convex — one household, one list. */
const LISTS = [
  { label: "House", value: "House" },
  { label: "Other", value: "Other" },
];

/**
 * Groceries: what is missing, and what is already in the cellar.
 *
 * Composition only. The grid owns both sections because they animate between one another, and
 * that is only possible while they share a container (see `screen.grid.tsx`).
 */
export const GroceryScreen = () => {
  const t = useTranslations("Groceries");
  const [list, setList] = useState("House");

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
        style={{ position: "absolute", top: -150, left: -150, opacity: 0.1 }}
      />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.title}>
            <ReceiptTextIcon size={28} />
            <Text.H4>{t("title")}</Text.H4>
          </View>
          <Select value={list} onChange={setList} options={LISTS} />
        </View>
        <GroceryGrid />
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  /** Clears the navigation bar, which floats over the page rather than sitting in it. */
  page: { paddingBottom: NAVIGATION_BAR_OFFSET },
  header: {
    padding: theme.spacing[24],
    gap: theme.spacing[12],
    alignItems: "center",
  },
  title: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
});
