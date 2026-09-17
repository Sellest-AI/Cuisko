import { useStore } from "jotai";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, StyleSheet, ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";

import { ArrowLeft, CircleAlert, ForkKnife, ForkKnifeIcon } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { AnimatePresence } from "@ui/motion";
import { SafeAreaView } from "@ui/safe-area-view";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";
import { DEFAULT_SERVINGS, serializeInstructions } from "@shared/recipes";

import type { Id } from "~/lib/convex/api";

import { importedDraftAtom } from "../_hooks/atoms";
import { useCreateRecipe } from "../_hooks/useCreateRecipe";
import { useRecipeDraft } from "../_hooks/useRecipeDraft";
import { useUpdateRecipe } from "../_hooks/useUpdateRecipe";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";
import { SCREEN_PADDING } from "../constants";
import { EditorActions } from "./actions";
import { CreatingOverlay } from "./creating-overlay";
import { EditorField } from "./field";
import { ImagePicker } from "./image-picker";
import { EmptyState } from "../_components/empty-state";
import { Servings } from "../_components/servings";
import { serializeIngredients } from "@shared/ingredients";

type Props = {
  /**
   * The recipe being rewritten, or nothing at all when one is being written from scratch. Its
   * presence is what the screen words itself from, and what it loads its fields from.
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
 * Saving goes through `_hooks/useCreateRecipe` for a new recipe and `_hooks/useUpdateRecipe` for
 * an existing one — siblings, not a branch inside one hook, because the two write to different
 * actions and navigate on success for different reasons. Both live beside the editor, in the same
 * module.
 *
 * `recipeId` also loads the recipe it names, through `_hooks/useRecipeDraft`, and seeds the fields
 * once it arrives — deliberately not `useRecipe`, which scales its answer to a servings choice
 * that has nothing to do with what this recipe is actually written for. See that hook for why.
 */
export const EditorScreen = ({ recipeId, style }: Props) => {
  const t = useTranslations("Recipe");

  const store = useStore();

  /**
   * The other way the fields can arrive full: a page the cook imported, handed sideways through
   * `importedDraftAtom` because a draft is too big to travel in a route.
   *
   * Read at the FIRST RENDER rather than in an effect, so the imported text is in the fields on the
   * very first frame instead of a frame of empty form followed by a re-render. It is the same
   * argument `servingsAtom` makes for comparing at read time rather than resetting in an effect.
   *
   * Through the store rather than `useAtom`, because the editor consumes this once and never wants
   * to hear about it again: subscribing would re-render the whole form on the write and again on
   * the clear, to seed fields it has already seeded.
   */
  const [imported] = useState(() => (recipeId ? undefined : store.get(importedDraftAtom)));

  const [title, setTitle] = useState(imported?.title ?? "");
  const [description, setDescription] = useState(imported?.description ?? "");
  const [servings, setServings] = useState(imported?.servings ?? DEFAULT_SERVINGS);
  const [ingredients, setIngredients] = useState(imported?.ingredients ?? "");
  const [instructions, setInstructions] = useState(imported?.instructions ?? "");

  const { recipe, isLoading, isMissing } = useRecipeDraft(recipeId);

  /**
   * Consumed once, then cleared — and the clearing is load-bearing rather than tidiness: without
   * it, tapping "write a recipe" a minute later reopens the editor full of a recipe the cook
   * already saved. An effect because it writes to something outside React, which is what an effect
   * is for; the seeding it pairs with happened at first render, above.
   */
  useEffect(() => {
    if (imported) store.set(importedDraftAtom, undefined);
  }, [imported, store]);

  /**
   * Seeded once per recipe rather than on every render: the fields are the cook's to type in from
   * here on, and a `recipe` that merely happens to re-render — cache revalidation, a sibling
   * screen touching the same query — must not overwrite text they have already started editing.
   *
   * The ref alone is not enough, which is why `isLoading` holds the form back below. It only guards
   * renders AFTER the first seed; before it, the fields are empty, editable, and about to be
   * overwritten the moment the query lands. Reaching the editor from the recipe page makes that
   * window nearly nothing — the query is already warm — but a cold deep link or a refresh pays the
   * full round trip, and anything typed into it would be silently discarded.
   */
  const seededFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!recipe || seededFor.current === recipeId) return;
    seededFor.current = recipeId;

    setTitle(recipe.title);
    setDescription(recipe.description);
    setServings(recipe.servings);
    setIngredients(serializeIngredients(recipe.ingredients));
    setInstructions(serializeInstructions(recipe.instructions));
  }, [recipe, recipeId]);

  const { create, isCreating, error: creatingError } = useCreateRecipe();
  const { update, isUpdating, error: updatingError } = useUpdateRecipe();

  const isSaving = recipeId ? isUpdating : isCreating;
  const error = recipeId ? updatingError : creatingError;

  const canSaveNew = ingredients.trim().length > 10 && instructions.trim().length > 10;

  /**
   * Valid, AND different from what the recipe already is — the second half is what stops a save
   * with nothing to say: reopening a recipe and pressing save without touching a field should not
   * read as an edit. Every field has to be independently valid rather than "at least one changed"
   * alone, since a save that carries a blanked-out title is not a save with something to say either.
   */
  const isEdited =
    title !== recipe?.title ||
    description !== recipe?.description ||
    ingredients !== serializeIngredients(recipe?.ingredients ?? []) ||
    instructions !== serializeInstructions(recipe?.instructions ?? []) ||
    servings !== recipe?.servings;

  const canSaveExisting =
    title.trim().length > 3 &&
    description.trim().length > 3 &&
    ingredients.trim().length > 10 &&
    instructions.trim().length > 10 &&
    isEdited;

  const canSave = recipeId ? canSaveExisting : canSaveNew;

  const onSave = () =>
    recipeId
      ? update({
        recipeId: recipeId as Id<"recipes">,
        title,
        description,
        servings,
        ingredients,
        instructions,
      })
      : create({
        title,
        description,
        servings,
        ingredients,
        instructions,
        // Where the draft came from, when it came from somewhere. `undefined` for a typed recipe.
        sourceUrl: imported?.sourceUrl,
      });

  /**
   * Held back rather than rendered empty: see `seededFor` above. An empty editable form is
   * indistinguishable from a recipe with nothing in it, and every keystroke typed into it is lost
   * at seed time. Placed after every hook so the early return cannot change the hook order.
   */
  if (isLoading)
    return (
      <View style={[style, styles.loading]}>
        <ActivityIndicator color={theme.colors.primary.base} />
      </View>
    );

  /**
   * Only when asked to edit something: a new recipe has no id and is never missing. Reads are open
   * to any signed-in cook (ADR 0014), so `useRecipeDraft` is what decides that a recipe which
   * exists is still not this cook's to edit, and this is where that decision is drawn.
   */
  if (recipeId && isMissing)
    return (
      <SafeAreaView style={[style, styles.loading]}>
        <EmptyState
          icon={ForkKnife}
          title={t("Editor.not_found_title")}
          body={t("Editor.not_found_body")}
          action={{
            label: t("Chrome.not_found_action"),
            icon: ArrowLeft,
            onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
          }}
        />
      </SafeAreaView>
    );

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
          hint={recipeId ? undefined : t("Editor.optional")}
          value={title}
          onChangeText={setTitle}
          placeholder={t("Editor.title_placeholder")}
          style={styles.field}
        />
        <EditorField
          label={t("Editor.description")}
          hint={recipeId ? undefined : t("Editor.optional")}
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
        disabled={isSaving || !canSave}
        saveLabel={t("Editor.save")}
        onSave={onSave}
        onCancel={() => router.back()}
      />
      <AnimatePresence>{isSaving && <CreatingOverlay />}</AnimatePresence>
    </>
  );
};

const TITLE_ICON_SIZE = 24;

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
