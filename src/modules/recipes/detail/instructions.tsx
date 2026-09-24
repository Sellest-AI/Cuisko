import { StyleSheet } from "react-native";

import { EmptyState } from "@ui/empty-state";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { RecipeScreen } from "../_components/recipe-screen";
import { SCREEN_PADDING } from "../constants";
import { useRecipe } from "../_hooks/useRecipe";
import { InstructionSection } from "./instructions.section";
import { ListOrdered } from "@ui/icons";

/** The method, in order. */
export const InstructionsScreen = ({ id }: { id?: string }) => {
  const t = useTranslations("Recipe");
  const { recipe, ingredients } = useRecipe(id);

  /** The chrome owns both the wait and the refusal; this tab draws nothing until there is a recipe. */
  if (!recipe) return null;

  const sections = recipe.instructions;

  /**
   * How many steps the sections above this one contribute, so the numbering runs unbroken.
   *
   * Takes the sections rather than closing over them: it used to read a module-level fixture, and
   * a helper that reaches past its arguments for the list it is counting is one that silently
   * counts the wrong recipe the moment there is more than one.
   */
  const stepsBefore = (index: number) =>
    sections.slice(0, index).reduce((total, section) => total + section.steps.length, 0);

  return (
    <RecipeScreen style={styles.screen}>
      <Text.Lg style={styles.title}>{t("Instructions.title")}</Text.Lg>
      {sections.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title={t("Instructions.title")}
          body={t("Instructions.empty")}
        />
      ) : (
        sections.map((section, index) => (
          <InstructionSection
            /** Titles are optional and need not be unique, so the position is the only stable key. */
            key={index}
            title={section.title}
            steps={section.steps}
            offset={stepsBefore(index)}
            lines={ingredients}
          />
        ))
      )}
    </RecipeScreen>
  );
};

const styles = StyleSheet.create({
  screen: { paddingHorizontal: SCREEN_PADDING },
  title: { marginBottom: theme.spacing[20] },
});
