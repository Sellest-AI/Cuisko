import { useCallback, useMemo } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";

import { Badge } from "@ui/badge";
import { CardChoice } from "@ui/cards/choice";
import { CheckIcon, DatabaseX, Search, Trash2, X } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { Input } from "@ui/input";
import { ModalScrollView } from "@ui/modal-scroll-view";
import { StepSlider } from "@ui/step-slider";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useModalAction } from "~/modules/navigation/modal-action";

import { SectionLabel } from "./_components/section-label";
import type { MealChoice } from "./_hooks/useMealCatalog";
import { useMealEditor, type MealScope, type MealTarget } from "./_hooks/useMealEditor";
import { MAX_SERVINGS, parseDateParam, parseMealSlot } from "./_model/model";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { EMPTY_PLATE_IMAGE } from "./_hooks/placeholders";

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

/** The pill under the one tile that is already on the plate. The others carry none: a search card is not weighed against the cellar. */
const SelectedBadge = () => {
  const t = useTranslations("Planning");

  return (
    <Badge icon={CheckIcon} variant="neutral" textColor={theme.colors.neutral.foreground}>
      {t("Tunnel.Meal.selected")}
    </Badge>
  );
};

type EditorProps = {
  /** The portions the plate is set to, or the ones a plate would be created for. */
  servings: number;
  /** The dish on the plate. Absent while the slot is still empty — nothing is marked selected. */
  selectedRecipeId?: string;
  recipes: MealChoice[];
  /** Whether a term is narrowing the grid, which decides what an empty grid means. */
  isSearching: boolean;
  /** True while the tiles on screen are the previous term's, and a better set is in flight. */
  isStale: boolean;
  query: string;
  setQuery: (query: string) => void;
  setServings: (servings: number) => void;
  choose: (recipe: MealChoice) => void;
  /** The server refused the last edit and the plate is back to what it was. */
  failed?: boolean;
};

const Editor = ({
  servings,
  selectedRecipeId,
  recipes,
  isSearching,
  isStale,
  query,
  setQuery,
  setServings,
  choose,
  failed = false,
}: EditorProps) => {
  const t = useTranslations("Planning");

  return (
    <ModalScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {failed && (
        <InfoBanner variant="warning" title={t("Tunnel.Meal.edit_failed_title")} icon={DatabaseX} style={styles.banner}>
          {t("Tunnel.Meal.edit_failed_body")}
        </InfoBanner>
      )}
      <SectionLabel label={t("Tunnel.Meal.portions")} value={String(servings)} />
      <StepSlider value={servings} max={MAX_SERVINGS} onChange={setServings} />
      <SectionLabel label={t(selectedRecipeId ? "Tunnel.Meal.change" : "Tunnel.Meal.pick")} />
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t("Tunnel.Meal.search")}
        rightIcon={query.length > 2 ? X : Search}
        onRightPress={() => { setQuery(""); Keyboard.dismiss(); }}
        style={styles.search}
      />
      {/* An empty grid under a term is a dead end; under an empty box it is a library with nothing in it yet. */}
      {recipes.length === 0 ? (
        <View style={styles.emptyText}>
          <Text.Base color={theme.colors.muted} style={{ textAlign: "center" }}>
            {t(isSearching ? "Tunnel.Meal.no_match" : "Tunnel.Meal.no_recipes")}
          </Text.Base>
        </View>
      ) : (
        <FlashList
          numColumns={COLUMNS}
          data={recipes}
          /** Dimmed while the tiles are the previous term's — see `isStale`. */
          style={isStale ? { ...styles.grid, ...styles.stale } : styles.grid}
          scrollEnabled={false}
          renderItem={({ item: recipe, index }) => {
            const selected = recipe.id === selectedRecipeId;

            return (
              <View style={{
                paddingRight: index % COLUMNS === 0 ? GAP / 2 : 0,
                paddingLeft: index % COLUMNS === 1 ? GAP / 2 : 0,
                paddingBottom: GAP,
                flex: 1
              }}>
                <CardChoice
                  key={recipe.id}
                  tone="neutral"
                  label={recipe.title}
                  imageSrc={recipe.imageSrc ?? EMPTY_PLATE_IMAGE}
                  selected={selected}
                  elevated={selected}
                  onPress={() => choose(recipe)}
                  onLongPress={() => router.push(`/recipe/${recipe.id}`)}
                  imageStyle={{ height: TILE_IMAGE_HEIGHT }}
                  badge={selected ? <SelectedBadge /> : undefined}
                  style={{ padding: theme.spacing[12], width: "100%", flex: 1 }}
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
 * Picking a dish closes the sheet: the portions are set on the slider above the grid first, and
 * the dish is the last answer. It closes only once the dish landed — a refused swap keeps the
 * sheet open, with the banner saying why.
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

  const { choose: pick } = editor;

  const choose = useCallback(async (recipe: MealChoice) => {
    if (await pick(recipe)) onClose();
  }, [pick, onClose]);

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
  emptyText: {
    paddingVertical: theme.spacing[32],
    maxWidth: 280,
    textAlign: "center",
    alignItems: "center",
    alignSelf: "center",
  },
  search: { marginBottom: theme.spacing[12] },
  banner: { marginBottom: theme.spacing[16] },
  grid: { width: "100%" },
  stale: { opacity: 0.5 },
});
