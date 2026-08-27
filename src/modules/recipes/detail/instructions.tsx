import { StyleSheet } from "react-native";

import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { RecipeScreen } from "../_components/recipe-screen";
import { SCREEN_PADDING } from "../constants";
import { InstructionSection } from "./instructions.section";

/** Placeholder recipe, until `_hooks/` exists to fetch a real one. */
const SECTIONS = [
  {
    title: "Sauce",
    steps: [
      "Soften the onions in a little oil until they turn translucent.",
      "Add the tomatoes and let the sauce reduce for ten minutes.",
    ],
  },
  {
    title: "Plate",
    steps: [
      "Spread the sauce over the base, leaving a clean edge all the way round.",
      "Scatter the mozzarella and finish with a few basil leaves.",
    ],
  },
];

/** The method, in order. */
export const InstructionsScreen = () => {
  const t = useTranslations("Recipe");

  return (
    <RecipeScreen style={styles.screen}>
      <Text.Lg style={styles.title}>{t("Instructions.title")}</Text.Lg>
      {SECTIONS.map((section, index) => (
        <InstructionSection
          key={section.title}
          title={section.title}
          steps={section.steps}
          offset={_stepsBefore(index)}
        />
      ))}
    </RecipeScreen>
  );
};

/** How many steps the sections above this one contribute, so the numbering runs unbroken. */
const _stepsBefore = (index: number) =>
  SECTIONS.slice(0, index).reduce((total, section) => total + section.steps.length, 0);

const styles = StyleSheet.create({
  screen: { paddingHorizontal: SCREEN_PADDING },
  title: { marginBottom: theme.spacing[20] },
});
