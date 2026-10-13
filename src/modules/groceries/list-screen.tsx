import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { HouseholdSelect } from "~/modules/households/household-select";
import { useNavigationBarClearance } from "~/modules/navigation/hooks";

import { sectionFromParam } from "./_model/model";
import { GroceryGrid } from "./list-screen.grid";

import { SafeAreaView } from "@ui/safe-area-view";
import { ReceiptTextIcon, StoreIcon } from "@ui/icons";
import { RadialGradient } from "@ui/radial-gradient";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

/** The raw `section` URL param, as the route read it — what it means is the model's call. */
type GroceryScreenProps = { section?: string };

/**
 * Groceries: what is missing, and what is already in the cellar.
 *
 * Composition only. The grid owns both sections because they animate between one another, and
 * that is only possible while they share a container (see `list-screen.grid.tsx`).
 *
 * `section` arrives raw from the route; `sectionFromParam` decides what it is allowed to mean,
 * because that is where `Section` lives and the route cannot reach it.
 *
 * The header names what leads. Opened for the cellar — from the home shortcut, or from a dish
 * just cooked — the page is the cellar with the list under it, and a "grocery list" title over a
 * cellar would read as having landed on the wrong page.
 */
export const GroceryScreen = ({ section }: GroceryScreenProps) => {
  const t = useTranslations("Groceries");
  const lead = sectionFromParam(section);
  const Icon = lead === "cellar" ? StoreIcon : ReceiptTextIcon;

  const clearance = useNavigationBarClearance();

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
      <ScrollView contentContainerStyle={{ paddingBottom: clearance }}>
        <SafeAreaView
          style={styles.header}
          edges={{ top: "additive", bottom: "off" }}
        >
          <View style={styles.title}>
            <Icon size={24} strokeWidth={theme.icon.titleStrokeWidth} />
            <Text.H4>{lead === "cellar" ? t("Sections.cellar") : t("title")}</Text.H4>
          </View>
          <HouseholdSelect />
        </SafeAreaView>
        <GroceryGrid lead={lead} />
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
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
