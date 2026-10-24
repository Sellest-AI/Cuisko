import type { Unit } from "./ingredients";
import type { MealSlot } from "./mealSlots";

/**
 * Where one conversation with Cuisko stops and the next one begins.
 *
 * Shared rather than declared on either side, because both sides ask the same question and a
 * disagreement between them is invisible: the server would continue a thread the screen had already
 * stopped drawing, and the shopper's next question would land under a conversation they cannot see.
 */

/**
 * Idle longer than this and the next message opens a NEW thread.
 *
 * Nothing is deleted when it elapses — the old thread keeps every message it ever had. A shopper who
 * comes back an hour later has moved on, and their next question should not be answered in the
 * context of a lunch they already cooked.
 *
 * Fifteen minutes is the gap between "I put the phone down to check the fridge" and "I came back to
 * this later". The first must not lose its context; the second must not inherit one.
 */
export const ASSISTANT_IDLE_MS = 15 * 60 * 1000;

/**
 * Whether a conversation last touched at `lastActivityAt` has gone cold by `now`.
 *
 * `now` is passed in rather than read here so this stays pure — it is the same comparison on the
 * server, where the clock is the deployment's, and on the client, where it is the phone's.
 *
 * The boundary belongs to the cold side: exactly fifteen minutes is stale. Either rule is
 * defensible and only one of them can be true, so the test pins it.
 */
export const isConversationStale = (lastActivityAt: number, now: number): boolean =>
  now - lastActivityAt >= ASSISTANT_IDLE_MS;

/**
 * The names the assistant's tools are registered under.
 *
 * Shared because the name is the join between two ends that no type connects: `answerTurn` keys
 * the tool set by it, and the AI SDK then names each stored part `tool-${name}`, which is what the
 * client reads. A literal typed on both sides drifts silently — rename one and the status lines
 * and cards just stop appearing. One constant makes that rename a compile error.
 */
export const ASSISTANT_TOOLS = {
  searchRecipes: "searchRecipes",
  searchIngredients: "searchIngredients",
  computeNutrition: "computeNutrition",
  display: "display",
  showButton: "showButton",
  showSubstitutions: "showSubstitutions",
  addToCellar: "addToCellar",
  removeFromCellar: "removeFromCellar",
  planMeal: "planMeal",
} as const;

export type AssistantTool = (typeof ASSISTANT_TOOLS)[keyof typeof ASSISTANT_TOOLS];

/**
 * Where a button Cuisko offers can take the cook. Names, not routes: the route is the client's,
 * decided when the button is drawn, so moving a screen never strands a button stored in an old
 * thread, and the model cannot compose a path the app does not have.
 */
export const BUTTON_DESTINATIONS = ["planning", "groceries", "recipes"] as const;

export type ButtonDestination = (typeof BUTTON_DESTINATIONS)[number];

/** The pill's colour, named as `ButtonPill` names it. */
export const BUTTON_VARIANTS = ["primary", "secondary", "neutral"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/**
 * What the showButton tool stores in a message: the sentence Cuisko leads into it with, and where
 * it goes. The label is not stored: it is the destination's, translated when drawn.
 */
export type AssistantButton = {
  v: 1;
  text: string;
  destination: ButtonDestination;
  variant: ButtonVariant;
};

/** Which way a cellar change went: stock put on the shelf, or taken off it. */
export const CELLAR_ACTIONS = ["add", "remove"] as const;

export type CellarAction = (typeof CELLAR_ACTIONS)[number];

/** One ingredient a cellar tool changed, and what it takes to undo it. */
export type CellarChangeLine = {
  ingredientId: string;
  /** The row the stock landed on, or came from. It may be gone since: a removal can empty it. */
  cellarItemId: string;
  unit: Unit;
  /** What actually moved, which for a removal can be less than was asked: the row held less. */
  quantity: number;
  /** Add only: what the add struck off the grocery list, which its undo puts back. */
  restoreToList?: number;
};

/**
 * What the addToCellar and removeFromCellar tools store in a message: the lines they changed, and
 * the ones they could not.
 *
 * **The lines are the undo's receipt.** The client undoes a change by replaying each line the
 * other way, so only lines that landed are in it. Each line is its own mutation, which is why a
 * call can half-apply, and why `failed` exists: the model reads it and tells the cook, and the card
 * never offers to undo what never happened.
 */
export type CellarChange = {
  v: 1;
  action: CellarAction;
  /**
   * The household whose cellar changed. The undo targets it, not whichever household is current:
   * a conversation outlives a household switch, and replaying the lines against the new household
   * would take its potatoes out instead.
   */
  householdId: string;
  lines: CellarChangeLine[];
  /**
   * Remove only: ingredients the cellar held none of, so nothing was taken. Not a failure: the
   * cellar is often behind the kitchen. Read by the model, never drawn.
   */
  absent: string[];
  /** Read by the model, never drawn. */
  failed: { ingredientId: string; reason: string }[];
};

/**
 * What the planMeal tool stores in a message when the plate landed: which plate, where, and what it
 * took the slot of — the chat's card, and its undo's receipt.
 */
export type MealPlanned = {
  v: 1;
  status: "planned";
  /** The household whose week changed, which the undo targets — see `CellarChange.householdId`. */
  householdId: string;
  plannedMealId: string;
  recipeId: string;
  /** The cook's local midnight of the day it landed on. */
  date: number;
  slot: MealSlot;
  servings: number;
  /** The planned plate it replaced, which the undo plans again on the same day and slot. */
  replaced?: { recipeId: string; servings: number };
};

/**
 * What the planMeal tool answers when a planned plate already holds the slot and the cook has not
 * said to replace it. Nothing was written. Read by the model, which asks; never drawn.
 */
export type MealSlotTaken = {
  v: 1;
  status: "occupied";
  current: { title: string; servings: number };
};

export type PlanMealResult = MealPlanned | MealSlotTaken;

/**
 * One recipe page from the web, as the chat's card draws it and the model reads it.
 *
 * A preview, never the recipe: no instructions. They are the long free prose where a line written
 * to a model would hide, and every later turn replays this as paid input. Adding it scrapes the
 * page again on the server, so the full recipe reaches the cook's row and never the model.
 */
export type WebRecipe = {
  /** Canonical: what the recipe is saved under once added. */
  url: string;
  /** A literal while Marmiton is the one source: a second one widens it. */
  source: "marmiton";
  title: string;
  servings: number;
  /** The page's lines, as written. */
  ingredients: string[];
  /** Absolute `https:` only, else absent and the card draws the placeholder. */
  imageUrl?: string;
};

/**
 * What findWebRecipe stores. Only "found" is drawn; "known" (a recipe Cuisko already holds) and
 * "none" are the model's to act on.
 */
export type FoundWebRecipe =
  | { v: 1; status: "found"; recipe: WebRecipe }
  | { v: 1; status: "known"; recipeId: string }
  | { v: 1; status: "none" };

/** One ingredient replaced by another, both catalog ingredient ids. */
export type IngredientSwap = { from: string; to: string };

/**
 * What the showSubstitutions tool stores in a message: the swaps, in the order the cook asked.
 *
 * Its own tool rather than a `display` kind: display takes a list of ids to show, and a swap is a
 * pair. Folding pairs into display would give its one input fields that apply to some kinds only,
 * which a model reads as optional and gets wrong.
 *
 * Ids only, like a recipe card: the name, emoji and image are resolved when the card is drawn.
 */
export type SubstitutionsCard = {
  v: 1;
  swaps: IngredientSwap[];
};

/**
 * What the display tool can put in front of the cook. One tool for every kind, rather than one
 * tool per kind: adding the week plan or the shopping list later is a new entry here, not a new
 * tool the model has to learn.
 */
export const DISPLAY_KINDS = ["recipes"] as const satisfies readonly (keyof DisplayPayloads)[];

export type DisplayKind = (typeof DISPLAY_KINDS)[number];

/**
 * What each kind of card stores, keyed by kind. A new kind is a new entry here, with its own shape.
 *
 * **The version lives per kind**, not on the card: the plan card changing shape must not make every
 * stored recipe card look out of date. A kind's `v` moves only when ITS payload changes.
 *
 * **Ids and no layout.** The rows are resolved when the card is drawn, so a recipe renamed since
 * the conversation is drawn as it is now, and how the card is laid out is the client's decision,
 * made at draw time — the layout can change without a stored card going stale.
 */
type DisplayPayloads = {
  recipes: { v: 1; ids: string[] };
};

/**
 * What the display tool stores in a message, and what the client draws from.
 *
 * Distributive over `K`, so `DisplayCard` alone is the union of every kind — narrowing on `kind`
 * gives that kind's payload — and `DisplayCard<"recipes">` is exactly one of them.
 */
export type DisplayCard<K extends DisplayKind = DisplayKind> = {
  [P in K]: { kind: P } & DisplayPayloads[P];
}[K];
