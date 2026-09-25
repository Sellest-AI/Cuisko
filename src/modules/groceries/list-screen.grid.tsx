import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { GroceryItem, type GroceryItemVariant } from "@ui/cards/grocery-item";
import { EmptyState } from "@ui/empty-state";
import { CalendarPlus, CheckIcon, IconComponent, ShoppingCartIcon, Store } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { Select } from "@ui/select";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations, type TranslationKeys } from "translations";

import { NO_EMOJI } from "@shared/ingredients";

import { useLocale } from "~/hooks/useLocale";
import { useUnitLabel } from "~/hooks/useUnitLabel";

import {
  formatQuantity,
  orderSections,
  rowsOf,
  type GroceryRow,
  type PendingFailure,
  type PendingIngredient,
  type Section,
  type StockRow,
} from "./_model/model";
import { SORTS, type Sort, type ToBuyGroup, type ToBuyHeading } from "./_model/sort";
import { useGroceryList } from "./_hooks/useGroceryList";
import { useGrocerySort } from "./_hooks/useGrocerySort";
import { usePendingIngredients } from "./_hooks/usePendingIngredients";

const COLUMNS = 3;
const GAP = theme.spacing[8];
const GUTTER = theme.spacing[16];

const HEADER_TRANSITION = LinearTransition.duration(200);
/** A sub-heading fades rather than flies: it has no earlier box to fly from, only a sort change. */
const SUBHEADER_ENTERING = FadeIn.duration(180);
const SUBHEADER_EXITING = FadeOut.duration(120);

/** The selector's wording per sort — the vocabulary is the model's, the words are not. */
const SORT_KEY: Record<Sort, TranslationKeys<"Groceries">> = {
  standard: "Sort.standard",
  "by-plan": "Sort.by_plan",
  "by-category": "Sort.by_category",
};

/**
 * The three sections, in the order stock runs through them: what is missing, what the household
 * owns, and what it has bought before but has neither of. The order of record — an arrival can
 * promote one of them to the top (`GroceryGrid`'s `lead`), the rest keep this order.
 *
 * Presentation only. What a tap in each one *does* is fixed by the model, not chosen here: a row
 * carries the intent of the section it sits in, so "Recently Bought" can only ever put something
 * back on the list and the cellar can only ever take stock out of it. Where that stock then goes
 * is decided by the plan, not the clock — a plate still waiting for it puts it back on the list,
 * and nothing waiting sends it to memory — which is why the cellar needs no second gesture.
 */
const DEFAULT_ORDER: Section[] = ["to-buy", "cellar", "recently-bought"];

const SECTION_DEFS: Record<
  Section,
  { labelKey: TranslationKeys<"Groceries">; icon?: IconComponent; color: string }
> = {
  "to-buy": { labelKey: "Sections.to_buy", icon: ShoppingCartIcon, color: theme.colors.primary.base },
  cellar: { labelKey: "Sections.cellar", icon: CheckIcon, color: theme.colors.secondary.base },
  "recently-bought": { labelKey: "Sections.recently_bought", color: theme.colors.neutral.muted },
};

/**
 * A card says which of three things it is: still missing, owned, or only remembered — and an
 * owned card that is still inside the undo window says that too, because it is the one a mistap
 * has to be able to find.
 */
const variantFor = (row: StockRow): GroceryItemVariant => {
  if (row.section === "to-buy") return "pending";
  if (row.section === "recently-bought") return "memory";

  return row.undoable ? "recent" : "settled";
};

/**
 * A ghost has no produce to show, so the slot the photo will occupy holds the neutral stand-in —
 * and a failed one holds the sign that it is not coming. Drawing nothing there instead would make
 * the card a different shape from its neighbours, and it would stop reading as the same list.
 */
const FAILED_EMOJI = "\u{26A0}\u{FE0F}";

/** The reason keys, which are worded per locale — the union is the model's, the wording is not. */
const REASON_KEY: Record<PendingFailure, TranslationKeys<"Groceries">> = {
  "not-food": "Pending.not_food",
  "not-an-ingredient": "Pending.not_an_ingredient",
  unreadable: "Pending.unreadable",
  error: "Pending.error",
};

type Row =
  | { kind: "header"; id: string; label: string; icon?: IconComponent; color: string }
  | { kind: "subheader"; id: string; heading: NonNullable<ToBuyHeading>; first: boolean }
  | { kind: "item"; stock: StockRow }
  | { kind: "ghost"; ghost: PendingIngredient };

/**
 * Full width, so it breaks the row it lands on and the next card starts a fresh line.
 *
 * `trailing` is the far end of the row — the sort selector, on "To Buy" — and it lives inside the
 * header rather than beside it so the two share one box: the header keeps its key across a sort
 * change, and the selector keeps its mounted instance with it.
 */
const SectionHeader = ({
  label,
  icon: Icon,
  color,
  trailing,
  style,
}: Omit<Extract<Row, { kind: "header" }>, "kind" | "id"> & { trailing?: ReactNode; style?: ViewStyle }) => (
  <Animated.View layout={HEADER_TRANSITION} style={[styles.section, style]}>
    <View style={styles.sectionTitle}>
      <Text.Lg>{label}</Text.Lg>
      {Icon && <Icon size={20} color={color} />}
    </View>
    {trailing}
  </Animated.View>
);

/**
 * A heading inside "To Buy": the plate, the aisle, or what no plate asked for.
 *
 * A plate is named by its dish and dated by its day and slot: "Lasagna" alone would not tell
 * Monday's from Friday's, and telling them apart is the whole reason the view exists.
 *
 * A plate's name opens its recipe: a shopper wondering why the list wants thyme for the lasagna
 * has the answer one tap away, on the page that lists it. The other two headings name nothing
 * that has a page.
 */
const SubHeader = ({ heading, style }: { heading: NonNullable<ToBuyHeading>; style?: ViewStyle }) => {
  const t = useTranslations("Groceries");
  const tPlanning = useTranslations("Planning");
  const tVocabulary = useTranslations("Vocabulary");
  const locale = useLocale();
  const router = useRouter();

  const title =
    heading.kind === "plate" ? heading.title
      : heading.kind === "category" ? tVocabulary(`Categories.${heading.category}`)
        : t("Groups.unplanned");

  const day = heading.kind === "plate"
    ? heading.date.toLocaleDateString(locale, { weekday: "long", day: "numeric" })
    : "";
  const caption = heading.kind === "plate"
    ? `${day.charAt(0).toLocaleUpperCase(locale) + day.slice(1)}  ·  ${tPlanning(`Meal.${heading.slot}`)}`
    : undefined;

  return (
    <Animated.View
      layout={HEADER_TRANSITION}
      entering={SUBHEADER_ENTERING}
      exiting={SUBHEADER_EXITING}
      style={[styles.subheader, style]}
    >
      {heading.kind === "plate"
        ? <Pressable onPress={() => router.push(`/recipe/${heading.recipeId}`)} style={styles.subheaderTitle}>
          <Text.Base weight={600} color={theme.colors.neutral.muted} numberOfLines={1}>
            {title}
          </Text.Base>
        </Pressable>
        : <Text.Base weight={600} color={theme.colors.neutral.muted} numberOfLines={1}>
          {title}
        </Text.Base>}
      {caption && <Text.Sm color={theme.colors.neutral.muted} numberOfLines={1} style={styles.subheaderCaption}>
        {caption}
      </Text.Sm>}
    </Animated.View>
  );
};

/** `lead` is the section the shopper arrived asking for — promoted to the top, if it has anything to show. */
type GroceryGridProps = { lead?: Section };

/**
 * The three lists, as one grid.
 *
 * Every card and every header is a sibling in a single wrapping container, produced by a single
 * keyed `.map`. That is what lets a card reflow rather than jump: when the cards around it change,
 * React matches it by key, keeps the instance, and the card's own `layout` transition carries it
 * to its new box while its neighbours close the gap. Split the sections into three containers and
 * this stops working silently — a card would unmount on one side and mount on the other, which is
 * an exit and an enter with nothing in between.
 *
 * Crossing a header is a move for the same reason, because the key survives it: a row keeps its
 * `ingredient:unit` identity wherever it sits, so buying something carries that one card out of
 * "To Buy" and down into the cellar. Only the leftover row of a part-bought ingredient — which
 * cannot share that key with the row beside it — enters and leaves, and fades when it does.
 *
 * "To Buy" is drawn from `toBuy` — the section as the chosen sort reads it — and the other two
 * from `sections`. A grouped view only adds sub-headings between the same keyed cards, so
 * switching sort is a reflow, not a remount; the one exception is a per-plate copy of a shared
 * row, which is a new key and fades in the way a leftover row already does.
 *
 * An empty section draws no header. There is nothing to say about a cellar you have not filled.
 *
 * With nothing wanted and nothing owned there is something to say, once, in place of both: the
 * week is where a list comes from, so the way on is planning it. "Recently bought" still draws
 * under it, because re-adding last week's shop is the other way a list starts. An ingredient the
 * shopper just typed hides it at once — it is already on its way into one of the two.
 */
export const GroceryGrid = ({ lead }: GroceryGridProps) => {
  const { width } = useWindowDimensions();
  const { sections, toBuy, submit, isEmpty } = useGroceryList();
  const { sort, setSort } = useGrocerySort();
  const { pending, dismiss } = usePendingIngredients();
  const t = useTranslations("Groceries");
  const unit = useUnitLabel();
  const router = useRouter();

  const sortOptions = SORTS.map((value) => ({ value, label: t(SORT_KEY[value]) }));

  const showsEmpty = isEmpty && pending.length === 0;

  const itemWidth = (width - GUTTER * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  /**
   * Ask, unless there is nothing to ask. A row with a single possible amount — the last bread in
   * the cellar — moves on the tap itself rather than opening a sheet to have that confirmed.
   */
  const tap = (stock: StockRow) => {
    if (stock.onlyOption !== null) return submit(stock, stock.onlyOption);

    /**
     * The sheet answers for one ingredient in one unit — the pair the row was merged on. A to-buy
     * card may stand for one plate's part of that row, and the sheet opens on what it showed.
     */
    return router.push({
      pathname: "/quantity",
      params: {
        ingredientId: stock.ingredientId,
        unit: stock.unit,
        intent: stock.intent,
        ...(stock.intent === "buy" ? { needed: String(stock.amount) } : {}),
      },
    });
  };

  const toRow = (row: GroceryRow): Row =>
    row.kind === "ghost"
      ? { kind: "ghost" as const, ghost: row.ghost }
      : { kind: "item" as const, stock: row.stock };

  /**
   * "To Buy", grouped. Ghosts lead the first group — they have neither a plate nor an aisle yet —
   * and when there is nothing but ghosts, one plain group is drawn for them to lead.
   */
  const toBuyRows = (): Row[] => {
    const ghosts = rowsOf("to-buy", { ...sections, "to-buy": [] }, pending).map(toRow);
    const groups: ToBuyGroup[] =
      toBuy.length === 0 && ghosts.length > 0 ? [{ id: "to-buy", heading: null, rows: [] }] : toBuy;

    // `first` is the first group of "To Buy", not the first row of the grid: a promoted `lead`
    // can push this section down, and its opening sub-header still sits under its own header.
    return groups.flatMap((group, index): Row[] => [
      ...(group.heading
        ? [{ kind: "subheader" as const, id: `header:to-buy:${group.id}`, heading: group.heading, first: index === 0 }]
        : []),
      ...(index === 0 ? ghosts : []),
      ...group.rows.map((stock): Row => ({ kind: "item", stock })),
    ]);
  };

  const rows: Row[] = orderSections(DEFAULT_ORDER, lead).flatMap((section) => {
    const { labelKey, icon, color } = SECTION_DEFS[section];

    // Ghosts count towards "is this section empty", or the first unknown ingredient a shopper
    // types would draw a card with no heading over it. Which section they land in is the model's
    // call, not this loop's: a ghost waits under the heading its intent aimed it at.
    const items = section === "to-buy" ? toBuyRows() : rowsOf(section, sections, pending).map(toRow);

    if (items.length === 0) return [];

    return [
      { kind: "header" as const, id: `header:${section}`, label: t(labelKey), icon, color },
      ...items,
    ];
  });

  return (
    <View style={styles.grid}>
      {showsEmpty && (
        <View style={styles.empty}>
          <EmptyState
            icon={Store}
            title={t("Empty.title")}
            body={t("Empty.body")}
            actions={[{
              label: t("Empty.action"),
              icon: CalendarPlus,
              onPress: () => router.push("/planning/new/setup"),
              variant: "primary"
            }]}
          />
        </View>
      )}
      {rows.map((row, index) => {
        if (row.kind === "header")
          return <SectionHeader
            key={row.id}
            label={row.label}
            icon={row.icon}
            color={row.color}
            style={index === 0 && !showsEmpty ? { marginTop: 0 } : undefined}
            trailing={row.id === "header:to-buy"
              ? <Select value={sort} onChange={setSort} options={sortOptions} />
              : undefined}
          />

        if (row.kind === "subheader") return <SubHeader
          key={row.id}
          heading={row.heading}
          style={row.first ? { marginTop: theme.spacing[8] } : undefined}
        />

        /**
         * The quantity slot carries what is happening instead of an amount, because that is the
         * line the shopper needs and the card has nowhere else to put it. The amount is the thing
         * they can least use here — they typed it seconds ago, and it comes back on the real card
         * the moment there is one.
         *
         * It also carries the wait in words, not only in the pulse: an animation is the whole
         * signal for a shopper who has motion turned off, and "Looking it up…" is not.
         */
        if (row.kind === "ghost") {
          const { id, name, state, reason } = row.ghost;
          const failed = state === "failed";

          return (
            <GroceryItem
              key={id}
              name={name}
              quantity={t(failed ? REASON_KEY[reason ?? "error"] : "Pending.resolving")}
              emoji={failed ? FAILED_EMOJI : NO_EMOJI}
              variant={failed ? "failed" : "resolving"}
              width={itemWidth - 1}
              // Only a failed ghost can be tapped, and the tap takes it away: there is no row to
              // open a quantity sheet on, and nothing to write if there were.
              onPress={failed ? () => dismiss(id) : undefined}
            />
          );
        }

        const type = variantFor(row.stock);
        const quantity = type === "memory" ? undefined :
          formatQuantity(row.stock.amount, row.stock.unit, unit);

        return (
          <GroceryItem
            key={row.stock.id}
            name={row.stock.name}
            quantity={quantity}
            emoji={row.stock.emoji}
            imageUrl={row.stock.imageUrl}
            variant={variantFor(row.stock)}
            expiresSoon={row.stock.expiresSoon}
            width={itemWidth - 1}
            onPress={() => tap(row.stock)}
          />
        )
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  /** Full width, so it breaks the wrapping row and sits alone above whatever section follows. */
  empty: { width: "100%" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    paddingHorizontal: GUTTER,
  },
  section: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[8],
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[4],
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
  subheader: {
    width: "100%",
    marginTop: theme.spacing[24],
    marginBottom: theme.spacing[6],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: theme.spacing[24],
  },
  /**
   * Takes the room the caption leaves, so a long dish name is what gets the ellipsis. `flex` and
   * not `flexShrink`: the shared Pressable forwards only the former to the flex item it renders.
   */
  subheaderTitle: {
    flex: 1,
  },
  subheaderCaption: {
    flexShrink: 0,
    marginBottom: theme.spacing[2],
  },
});
