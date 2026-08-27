import { useState } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";

import { CircleAlert, ForkKnifeIcon } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { SafeAreaView } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { useCreateRecipe } from "../_hooks/useCreateRecipe";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";
import { SCREEN_PADDING } from "../constants";
import { EditorActions } from "./actions";
import { CreatingOverlay } from "./creating-overlay";
import { EditorField } from "./field";
import { ImagePicker } from "./image-picker";
import { Servings } from "../_components/servings";

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
 * title twice, in two files, is how the two drift apart.
 *
 * Saving goes through `_hooks/useCreateRecipe`, a sibling: the editor and the writing live in one
 * module, so the call stays inside it.
 *
 * Only the write is wired. `recipeId` still loads nothing, so opening this to edit an existing
 * recipe shows an empty form — that arrives with `getOne`.
 */
export const EditorScreen = ({ recipeId, style }: Props) => {
  const t = useTranslations("Recipe");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");

  const { create, isCreating, progress, phase, error } = useCreateRecipe();

  const canSave = ingredients.trim().length > 10 && instructions.trim().length > 10;

  return (
    <>
      {/*
        * Keyboard-aware rather than plain: the editor is four fields tall and the last two are the
        * long ones, so on a phone the keyboard opens straight over the field it was opened from
        * and the cook types blind. This scrolls the focused field back above the keys and pads the
        * page by the keyboard's own height, so the last line of the instructions is still reachable
        * while they are being written. `bottomOffset` is the clearance the floating actions need —
        * without it the field stops under the save button instead of above it.
        */}
      <KeyboardAwareScrollView
        style={style}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        bottomOffset={NAVIGATION_BAR_OFFSET}
        keyboardShouldPersistTaps="handled"
      >
        <SafeAreaView edges={{ top: "additive", bottom: "off" }} style={styles.titleRow}>
          <ForkKnifeIcon size={TITLE_ICON_SIZE} color={colors.foreground} />
          <Text.H4>{t(recipeId ? "Editor.edit_title" : "Editor.new_title")}</Text.H4>
        </SafeAreaView>
        {error !== null && (
          <InfoBanner
            variant="warning"
            icon={CircleAlert}
            title={t("Creating.error_title")}
            style={styles.error}
          >
            {t("Creating.error_body")}
          </InfoBanner>
        )}
        <ImagePicker label={t("Editor.image")} style={styles.image} />
        <EditorField
          label={t("Editor.title")}
          hint={t("Editor.optional")}
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
      </KeyboardAwareScrollView>
      <EditorActions
        disabled={isCreating || !canSave}
        saveLabel={t("Editor.save")}
        onSave={() =>
          create({ title, description, servings, ingredients, instructions })
        }
        onCancel={() => router.back()}
      />
      {isCreating && <CreatingOverlay progress={progress} phase={phase} />}
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
  /**
   * Above the fields rather than beside the save button: the cook has been returned to a form they
   * had already finished with, and the reason has to be where they land, not where they left.
   */
  error: { marginBottom: theme.spacing[20] },
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
