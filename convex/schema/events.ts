import type { Id } from "@convex/_generated/dataModel";
import type { Category } from "@shared/categories";

/** What a PostHog property may hold: flat values only, so every one is a column a chart can group by. */
type PropertyValue = string | number | boolean | undefined;

/** Refuses an event whose properties are not flat. */
type Flat<T extends Record<string, Record<string, PropertyValue>>> = T;

/** Where a recipe came from: the shared catalog, or a cook's own, typed, from a page or from a video. */
export type RecipeOrigin = "catalog" | "typed" | "link" | "video";

/** A catalog ingredient as an event carries it (`reportedIngredient`). The name and category are absent when the row is gone. */
export type ReportedIngredient = { ingredientId: Id<"ingredients">; ingredient?: string; category?: Category };

/** A recipe as an event carries it (`reportedRecipe`): never its title. The origin is absent when the row is gone. */
export type ReportedRecipe = { recipeId: Id<"recipes">; recipeOrigin?: RecipeOrigin };

/** A plate as every plate event carries it (`reportedPlate`), so one plate is followed from planned to how it ended. */
export type ReportedPlate = ReportedRecipe & { plannedMealId: Id<"plannedMeals">; mealPlanId: Id<"mealPlans"> };

/** What a planned week or plate came to (`commitPlan`'s summary), with who it was for and what it replaced. */
type PlanCounts = {
  plates: number;
  days: number;
  lines: number;
  coveredLines: number;
  tickedLines: number;
  groceryLines: number;
  people: number;
  replaced: number;
};

/**
 * Whether the write was the cook taking back one they just made, from an undo button. An undo is
 * reported like any write, so every plate and purchase keeps its whole story and joins still hold;
 * a chart of what cooks chose filters `isUndo = false`.
 */
type Undoable = { isUndo: boolean };

/** Added by `accountEventOf` whenever the account's creation time is known. */
type AccountAge = { accountAgeDays?: number };

/**
 * Every product event the backend sends PostHog, named as PostHog shows them, with what each one
 * carries. Cost is not here: a paid call is an `$ai_generation`, sent by the trace layer
 * (`schema/tracing.ts`).
 *
 * A closed list for the reason `OPERATIONS` is one (`schema/tracing.ts`): a funnel joins these by
 * name, and `account deleted` next to `account_deleted` would split it without anything failing.
 *
 * **The properties are declared here, so `captureEvent` refuses an event sent without them.** An
 * event carries the id of every row it is about and of the rows another event is joined on (ADR
 * 0019): an import names its recipe, so it can be matched to the times that recipe was cooked. A new
 * event is one entry here, and choosing its ids is that entry's review.
 */
export type EventProperties = Flat<{
  // An account's life.
  /** A new deletion request, not a repeat while one is pending (`requestDeletion`). */
  "account deletion requested": AccountAge & { deletionDueAt: number };
  /** A sign-in that cleared a pending request (`clearDeletion`). */
  "account deletion cancelled": AccountAge & { daysLeft: number };
  /** The purge ran, anonymizing or, forced, erasing the account (`purgeUser`). */
  "account deleted": AccountAge & { outcome: "anonymized" | "erased" };

  // A week's life, each sent by the router of the one writer ADR 0013 names.
  /** A week from the tunnel, the plan a shuffle drew (`planning/commit`). Each plate's events name the same `mealPlanId`. */
  "week planned": PlanCounts & { mealPlanId: Id<"mealPlans"> };
  /**
   * One plate from a recipe screen or Cuisko, no shuffle behind it (`planning/planOne`). `isUndo`
   * is the chat's undo putting back the dish Cuisko replaced.
   */
  "plate planned": PlanCounts & ReportedPlate & Undoable;
  /** A plate settled, or a meal recorded on today with no plate (`planning/cookOne`). */
  "meal cooked": ReportedPlate & { fromPlate: boolean; servings: number };
  /** A plate nobody cooked, closed by the clock (`planning/skipOne`). Has no person: no cook acted. */
  "meal skipped": ReportedPlate & { servings: number };
  /**
   * A planned plate the cook took off the week (`planning/removeOne`), not one a new week replaced.
   * `isUndo` is the chat's undo of a plate Cuisko had just planned.
   */
  "meal removed": ReportedPlate & Undoable & { daysAhead: number; servings: number };

  // The kitchen.
  /**
   * An item the cook put on the list by hand (`cellars/addToGroceryList`). A planned week's lines
   * are `groceryLines` on `week planned`, and an undo putting a purchase back is neither.
   */
  "grocery item added": ReportedIngredient & { groceryListItemId: Id<"groceryListItems"> };
  /**
   * The cook striking an ingredient off the list without buying it (`cellars/removeFromGroceryList`):
   * every line of it in that unit, `lines` of them. About the ingredient, not a row, since the
   * gesture takes them all; a mistap and "not needed any more" are told apart by the time since
   * `grocery item added` for the same ingredient, in PostHog.
   *
   * @limitation That timing is a rough signal: a line a planned week wrote has no `grocery item
   * added`, and a hand add merges into the plan's row of the same unit, so a removal cannot say
   * whose line it was. Accepted because telling them apart needs rows split by origin, which
   * `addToGroceryList` deliberately merges. The removal counts themselves are exact.
   */
  "grocery item removed": ReportedIngredient & { lines: number };
  /** A purchase on the shelf, struck off the list or not (`cellars/addToCellar`). An undo is not one. */
  "food added to cellar": ReportedIngredient & { cellarItemId: Id<"cellarItems">; struckLines: number };
  /**
   * A purchase taken back off the shelf within its undo window (`cellars/removeFromCellar`): the
   * chat card's undo, or a removal the groceries screen peeled from a live receipt. Joins the
   * `food added to cellar` it cancels on `cellarItemId`. Any other removal sends nothing yet.
   */
  "purchase undone": ReportedIngredient & { cellarItemId: Id<"cellarItems"> };
  /** A new recipe the cook typed in the editor (`recipes/createOne`). Never an edit of one. */
  "recipe created": { recipeId: Id<"recipes">; ingredients: number };
  /** A new recipe read from a page or a video (`recipes/createOne`, `recipes/importVideo`). */
  "recipe imported": { recipeId: Id<"recipes">; source: "link" | "video"; ingredients: number };
  /**
   * The share sheet reported a recipe's link sent (`recipes/recordShare`). On Android the sheet
   * cannot tell a cancel from a send, so a cancel there counts too. `isOwned` tells a cook passing
   * on their own recipe from one passing on the catalog's or another cook's.
   */
  "recipe shared": ReportedRecipe & { isOwned: boolean };

  // The chat.
  /**
   * One search for a dish the cook asked the chat for (`recipes/findWebRecipe`), whatever it found.
   * Never the dish's text: it is the cook's words. A failure also goes to Error tracking.
   */
  "web recipe searched": {
    outcome: "known" | "found" | "none" | "failed";
    /** Known only: by the catalog's titles (no web request), or by the chosen page's address. */
    knownBy?: "title" | "source";
    /** Known only: the recipe it is about. */
    recipeId?: Id<"recipes">;
    /** Failed only. */
    reason?: "parse" | "unreachable";
    /** Found, or known by source: the chosen page's. */
    rating?: number;
    reviews?: number;
    /**
     * None only, and only when a card named the dish but fell short of the bar: the one `bestOf`
     * would pick with no bar, as three columns so a chart can set its rating against its reviews.
     * A card that cleared the bar and would not read is counted in `unreadable`.
     */
    nearestMissUrl?: string;
    nearestMissRating?: number;
    nearestMissReviews?: number;
    /** The Marmiton cards that named the dish, before the bar. Absent when Marmiton was not asked. */
    candidates?: number;
    /** Pages that cleared the bar and would not read, when any did: a scraping problem, not the bar's. */
    unreadable?: number;
  };
}>;

export type AnalyticsEvent = keyof EventProperties;

/**
 * One event as `captureEvent` takes it: a union over every event, so its `properties` must be the
 * ones `EventProperties` declares for that name. Here rather than beside `captureEvent` so a
 * `functions/` helper can build one (`accountEventOf`) without importing the sender (C18).
 */
export type CapturedEvent<E extends AnalyticsEvent = AnalyticsEvent> = {
  [Name in E]: {
    event: Name;
    /** The cook, or the household's id with `personless: true` when no cook acted (`skipMeal`). */
    distinctId: string;
    householdId?: Id<"households">;
    personless?: boolean;
    properties: EventProperties[Name];
  };
}[E];
