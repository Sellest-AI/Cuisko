import { useCallback, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { Badge } from "@ui/badge";
import { CardChoice } from "@ui/cards/choice";
import { CheckIcon, DatabaseX, Search, Trash2 } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { Input } from "@ui/input";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { StepSlider } from "@ui/step-slider";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useModalAction } from "~/modules/navigation/modal-action";

import { MEAL_STATUS } from "./_components/meal-status";
import { SectionLabel } from "./_components/section-label";
import { useMealEditor, type MealScope, type MealTarget } from "./_hooks/useMealEditor";
import { MAX_SERVINGS, parseDateParam, parseMealSlot, type Recipe } from "./_model/model";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";

const COLUMNS = 2;
const GUTTER = theme.spacing[16];
const GAP = theme.spacing[12];

/** Clears the close button and the action beside it, both drawn by the modal layout. */
const CHROME_HEIGHT = 24;

const TILE_IMAGE_HEIGHT = 86;

/** A plate already in the plan, or the day and slot of one that is not there yet. */
type Params = { mealId?: string; date?: string; slot?: string; scope?: string };

type Props = {
  params: Params;
  onClose: () => void;
};

const Nothing = ({ label }: { label: string }) => (
  <View style={[styles.page, styles.empty]}>
    <Text.Base color={theme.colors.muted}>{label}</Text.Base>
  </View>
);

/** The pill under a tile: what this dish would cost the kitchen, or that it is the one on the plate. */
const RecipeBadge = ({ recipe, selected }: { recipe: Recipe; selected: boolean }) => {
  const t = useTranslations("Planning");
  const status = MEAL_STATUS[recipe.status];

  if (selected) return <Badge
    icon={CheckIcon}
    variant="neutral"
    textColor={theme.colors.neutral.foreground}
  >
    {t("Tunnel.Meal.selected")}
  </Badge>;

  return <Badge icon={status.icon} variant={status.badge}>{t(status.key)}</Badge>;
};

type EditorProps = {
  /** The portions the plate is set to, or the ones a plate would be created for. */
  servings: number;
  /** The dish on the plate. Absent while the slot is still empty — nothing is marked selected. */
  selectedRecipeId?: string;
  recipes: Recipe[];
  query: string;
  setQuery: (query: string) => void;
  setServings: (servings: number) => void;
  choose: (recipe: Recipe) => void;
  /** The server refused the last edit and the plate is back to what it was. */
  failed?: boolean;
};

const Editor = ({
  servings,
  selectedRecipeId,
  recipes,
  query,
  setQuery,
  setServings,
  choose,
  failed = false,
}: EditorProps) => {
  const t = useTranslations("Planning");
  /**
   * The dish on the plate when the sheet opened. Pinned rather than read live, so tapping a tile
   * does not reshuffle the grid under the finger that tapped it — on an empty slot there is
   * nothing to pin, and the catalogue keeps the order it came in.
   */
  const [pinnedRecipeId] = useState(selectedRecipeId);

  const ordered = useMemo(
    () => [...recipes].sort((first, second) =>
      Number(second.id === pinnedRecipeId) - Number(first.id === pinnedRecipeId)),
    [recipes, pinnedRecipeId],
  );


  return (
    <ModalScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {failed && (
        <InfoBanner variant="warning" title={t("Tunnel.Meal.edit_failed_title")} icon={DatabaseX} style={styles.banner}>
          {t("Tunnel.Meal.edit_failed_body")}
        </InfoBanner>
      )}
      <SectionLabel label={t("Tunnel.Meal.portions")} value={String(servings)} />
      <StepSlider value={servings} max={MAX_SERVINGS} onChange={setServings} />
      <SectionLabel
        label={t(selectedRecipeId ? "Tunnel.Meal.change" : "Tunnel.Meal.pick")}
        value={String(recipes.length)}
      />
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t("Tunnel.Meal.search")}
        rightIcon={Search}
        style={styles.search}
      />
      {recipes.length === 0 ? (
        <Text.Base color={theme.colors.muted}>{t("Tunnel.Meal.no_match")}</Text.Base>
      ) : (
        <FlashList
          numColumns={COLUMNS}
          data={ordered}
          style={styles.grid}
          scrollEnabled={false}
          renderItem={({ item: recipe, index }) => {
            const selected = recipe.id === selectedRecipeId;

            return (
              <View style={{
                paddingRight: index % COLUMNS === 0 ? GAP / 2 : 0,
                paddingLeft: index % COLUMNS === 1 ? GAP / 2 : 0,
                paddingBottom: GAP,
              }}>
                <CardChoice
                  key={recipe.id}
                  tone="neutral"
                  label={recipe.title}
                  imageSrc={recipe.imageSrc}
                  selected={selected}
                  elevated={selected}
                  onPress={() => choose(recipe)}
                  onLongPress={() => router.push(`/recipe/${recipe.id}`)}
                  imageStyle={{ height: TILE_IMAGE_HEIGHT }}
                  badge={<RecipeBadge recipe={recipe} selected={selected} />}
                  style={{ padding: theme.spacing[12], width: "100%" }}
                />
              </View>
            );
          }}
        />
      )}
    </ModalScrollView>
  );
};

/**
 * The plate the list tapped: cooked for how many, made of what, or dropped from the week — and on
 * an empty slot, the same sheet with nothing on it yet.
 *
 * Picking a dish does not close the sheet. The three questions are one visit — a user swapping a
 * dish is the one most likely to want the portions changed with it, and a sheet that shuts on the
 * first answer makes them open it again to give the second.
 *
 * A route of its own rather than a sheet inside the review step, so the planning screen can reach
 * the same plate later. Its params are therefore untrusted, and validated before a hook runs.
 */
const Sheet = ({ target, scope, onClose }: {
  target: MealTarget;
  scope: MealScope;
  onClose: () => void;
}) => {
  const t = useTranslations("Planning");
  const { meal, missing, isLoading, failed, remove, ...editor } = useMealEditor(target, scope);

  /**
   * Removing leaves nothing to come back to, so the sheet goes with it — once the plate has
   * actually gone. A refused removal keeps the sheet open, with the banner saying why.
   */
  const destroy = useCallback(async () => {
    if (await remove()) onClose();
  }, [remove, onClose]);

  const choose = useCallback((recipe: Recipe) => {
    editor.choose(recipe);
    onClose();
  }, [editor, onClose]);

  /** Nothing to throw away until a dish is on the plate, so the slot opens without the action. */
  useModalAction(meal ? { icon: Trash2, onPress: destroy, variant: "danger" } : null);

  /** The plate is being asked for; an empty sheet beats a spinner that lands and leaves in a blink. */
  if (isLoading) return <View style={styles.page} />;

  /** A stale link, or the moment between removing the plate and the dismissal landing. */
  if (missing) return <Nothing label={t("Tunnel.Meal.missing")} />;

  return <Editor {...editor} choose={choose} failed={failed} />;
};

/**
 * What the sheet was opened on, out of route text that could say anything.
 *
 * `mealId` first: a plate that exists is edited wherever it sits, and only a link without one is
 * read as an invitation to fill a slot. A day and a slot that do not both survive validation leave
 * nothing to open — better an honest empty state than a plate created on a day nobody asked for.
 */
const _targetOf = ({ mealId, date, slot }: Params): MealTarget | undefined => {
  if (mealId) return { kind: "meal", mealId };

  const day = parseDateParam(date);
  const mealSlot = parseMealSlot(slot);

  return day && mealSlot ? { kind: "slot", date: day, slot: mealSlot } : undefined;
};

/**
 * Which week the link meant, defaulting to the one the app keeps.
 *
 * The plan is the safe default and the draft is the one that has to say so: a tunnel link that
 * lost its scope would edit the week the user is still keeping, where a planning link that lost
 * its scope only edits a draft nothing is reading — visibly nothing happens, rather than
 * invisibly the wrong thing.
 */
const _scopeOf = (scope?: string): MealScope => (scope === "draft" ? "draft" : "plan");

export const MealScreen = ({ params, onClose }: Props) => {
  const t = useTranslations("Planning");
  const { mealId, date, slot, scope } = params;

  /**
   * Keyed on the params themselves rather than on the object holding them, which the route rebuilds
   * every render: the target carries a `Date`, and a new one each render would hand the hook a new
   * identity — and with it a new `choose` — on every keystroke in the search box.
   */
  const target = useMemo(() => _targetOf({ mealId, date, slot }), [mealId, date, slot]);

  if (!target) return <Nothing label={t("Tunnel.Meal.missing")} />;

  return <Sheet target={target} scope={_scopeOf(scope)} onClose={onClose} />;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: CHROME_HEIGHT,
    paddingBottom: Platform.select({
      ios: theme.spacing[32],
      default: theme.spacing[8],
    }),
    paddingHorizontal: GUTTER,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  search: { marginBottom: theme.spacing[12] },
  banner: { marginBottom: theme.spacing[16] },
  grid: { width: "100%" }
});
