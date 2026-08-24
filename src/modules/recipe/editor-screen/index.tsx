import { useState } from "react";
import { View, StyleSheet, ViewStyle, ScrollView } from "react-native";
import { router } from "expo-router";

import { ForkKnifeIcon } from "@ui/icons";
import { SafeAreaView } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { NAVIGATION_BAR_OFFSET } from "../../navigation/constants";
import { SCREEN_PADDING } from "../constants";
import { EditorActions } from "./actions";
import { EditorField } from "./field";
import { ImagePicker } from "./image-picker";
import { Servings } from "../ingredients-screen.servings";

type Props = {
  /**
   * The recipe being rewritten, or nothing at all when one is being written from scratch. Its
   * presence is what the screen words itself from; loading the recipe behind it lands with
   * `_hooks/`.
   */
  recipeId?: string;
  style?: ViewStyle;
};

/**
 * Writing a recipe, or rewriting one.
 *
 * One screen for both, because the two differ only in what is already in the fields — asking for a
 * title twice, in two files, is how the two drift apart. The answers are held here and go nowhere
 * yet: persistence arrives with the module's hooks, and the form is what has to be right first.
 */
export const EditorScreen = ({ recipeId, style }: Props) => {
  const t = useTranslations("Recipe");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");

  return (
    <>
      <ScrollView
        style={style}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={{ top: "additive", bottom: "off" }} style={styles.titleRow}>
          <ForkKnifeIcon size={TITLE_ICON_SIZE} color={colors.foreground} />
          <Text.H4>{t(recipeId ? "Editor.edit_title" : "Editor.new_title")}</Text.H4>
        </SafeAreaView>
        <ImagePicker label={t("Editor.image")} style={styles.image} />
        <EditorField
          label={t("Editor.title")}
          value={title}
          onChangeText={setTitle}
          placeholder={t("Editor.title_placeholder")}
          style={styles.field}
        />
        <EditorField
          label={t("Editor.description")}
          hint={t("Editor.optional")}
          value={description}
          onChangeText={setDescription}
          placeholder={t("Editor.description_placeholder")}
          style={styles.field}
          multiline
        />
        <View style={styles.divider} />
        <Servings servings={servings} onChange={setServings} style={styles.field} />
        <EditorField
          label={t("Editor.ingredients")}
          value={ingredients}
          onChangeText={setIngredients}
          placeholder={t("Editor.ingredients_placeholder")}
          style={styles.field}
          multiline
        />
        <EditorField
          label={t("Editor.instructions")}
          value={instructions}
          onChangeText={setInstructions}
          placeholder={t("Editor.instructions_placeholder")}
          style={styles.field}
          multiline
        />
        <SafeAreaView edges={{ top: "off", bottom: "additive" }} />
      </ScrollView>
      <EditorActions
        saveLabel={t("Editor.save")}
        onSave={() => router.back()}
        onCancel={() => router.back()}
      />
    </>
  );
};

/** What a recipe is written for unless its author says otherwise — two people, not one. */
const DEFAULT_SERVINGS = 2;

const TITLE_ICON_SIZE = 24;

const styles = StyleSheet.create({
  /** Clears the actions, which float over the page rather than sitting at the end of it. */
  page: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: NAVIGATION_BAR_OFFSET,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: theme.spacing[12],
    marginTop: theme.spacing[24],
    marginBottom: theme.spacing[32],
  },
  image: { marginBottom: theme.spacing[4] },
  field: { marginTop: theme.spacing[20] },
  /** Splits what the recipe *is* from what it is made of; a rule, not a section break. */
  divider: {
    height: 2,
    width: "100%",
    borderRadius: theme.radius.full,
    backgroundColor: colors.neutral.subtle,
    marginTop: theme.spacing[20],
    opacity: 0.5,
  },
});
