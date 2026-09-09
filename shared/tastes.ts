import { type AuthoredTag } from "./tags";

/**
 * The cravings a week can be steered by — what the planning tunnel's mood step offers.
 *
 * A strict subset of [`AUTHORED_TAGS`](./tags.ts), and it has to be, for the same reason
 * [`NUTRITION_PREFERENCES`](./preferences.ts) is a subset of the computed half: a steer is only
 * useful if there is a tag on the recipe for it to match, so an entry here that no recipe can
 * carry is a filter that returns nothing forever. The `satisfies` below is what holds that — a
 * typo, or a tag renamed in `tags.ts`, is a compile error rather than an empty week.
 *
 * **This list replaced two hand-written ones.** `MOODS` and `FOCUSES` used to live in
 * `src/modules/planning/_hooks/placeholders.ts` with ids of their own invention, and they had the
 * disease the plan's §1 describes for `UTENSILS`: `"one-pan"` sitting beside the vocabulary's
 * `"one-pot"`, `"comfort"` beside `"comfort-food"`, with nothing to catch either. Three of their
 * entries — `high-protein`, `low-carb`, `low-calorie` — were worse than a typo: they asked the
 * same question `NUTRITION_PREFERENCES` asks, in a second vocabulary that aggregates differently,
 * so the same wish was one week's steer in one place and a stored preference in the other.
 *
 * Two more, `high-fibre` and `iron-rich`, briefly landed here on the way past and did not stay:
 * both are nutrition claims, so they became computed tags measured from the catalog and joined
 * `NUTRITION_PREFERENCES` instead. What is left is what it should be — cravings, none of which any
 * ingredient row can decide.
 *
 * ⚠️ **A taste steers one week; it is never stored.** That is the whole line between this list and
 * `NUTRITION_PREFERENCES`: a craving is what somebody felt like on a Sunday, so `resetTunnelAtom`
 * clears it and no table holds it. `seeks` describes how a person eats, so it survives the run and
 * aggregates. Anything tempted to persist a taste is asking the household question with the
 * week's answer.
 *
 * The order is the mood-shaped entries first and the narrower asks after, which is what the two
 * lists it replaced encoded as two separate steps. Kept as ordering rather than as a split now
 * that the focus step asks about `seeks` instead.
 */
export const TASTES = [
  "budget",
  "few-ingredients",
  "veggie-forward",
  "spicy",
  "gut-friendly",
  "world-flavours",
  "comfort-food",
  "one-pot",
  "soup",
  "fresh",
  "freezer-friendly",
  "fussy-eater",
  "kid-friendly",
] as const satisfies readonly AuthoredTag[];

export type Taste = (typeof TASTES)[number];

export const isTaste = (value: string): value is Taste => TASTES.some((taste) => taste === value);
