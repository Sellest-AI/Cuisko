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
} as const;

export type AssistantTool = (typeof ASSISTANT_TOOLS)[keyof typeof ASSISTANT_TOOLS];

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
