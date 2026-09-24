import type { DisplayCard } from "@shared/assistant";

/**
 * How a card is laid out, decided when it is drawn rather than stored with it.
 *
 * `single` is one recipe as a card the width of the answer: when Cuisko recommends one dish, a
 * shelf with nothing beside it reads as a list that failed to load. `shelf` is the horizontal row,
 * the next card visibly peeking in from the edge.
 */
export type DisplayLayout = "single" | "shelf";

/**
 * The client's half of the display tool: Cuisko says what and in which order, this says how.
 *
 * Here and not in the stored card, so a layout added later (a vertical list past some count, a
 * grid for a week plan) applies to every conversation already on the server. Only the count
 * decides so far; the kind will once there is a second one.
 */
export const displayLayout = (card: DisplayCard): DisplayLayout =>
  card.ids.length === 1 ? "single" : "shelf";
