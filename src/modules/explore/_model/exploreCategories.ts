import type { Cuisine } from "@shared/cuisines";
import { seedOfDayKey } from "@shared/dates";

/**
 * A cuisine the Explore page offers as a tile, with the two emoji it can be drawn with.
 *
 * Two emoji because Windows draws no flag: Chrome and Edge there show "FR" in two letters where
 * 🇫🇷 should be. The flag is the phone's, the dish the web's, and the one component that hands the
 * tile its emoji picks between them. A cuisine that is not one country's (`north-african` covers
 * three) has no flag to pick, and carries its dish twice.
 */
export type ExploreCategory = { cuisine: Cuisine; flag: string; dish: string };

/**
 * The cuisines a cook can browse the catalog by — the ones with at least eight catalog recipes,
 * so no tile opens a near-empty page.
 *
 * Closed and written out rather than derived from `CUISINES`: `fusion` and `other` say nothing to
 * someone choosing what to eat, and a cuisine joins the list when the catalog can fill its page,
 * which is a decision, not a count. The label is `Vocabulary.Cuisines.<cuisine>`, already
 * translated.
 */
export const EXPLORE_CATEGORIES: readonly ExploreCategory[] = [
  { cuisine: "french", flag: "🇫🇷", dish: "🥖" },
  { cuisine: "british", flag: "🇬🇧", dish: "🫖" },
  { cuisine: "italian", flag: "🇮🇹", dish: "🍝" },
  { cuisine: "indian", flag: "🇮🇳", dish: "🍛" },
  { cuisine: "mexican", flag: "🇲🇽", dish: "🌮" },
  { cuisine: "japanese", flag: "🇯🇵", dish: "🍣" },
  { cuisine: "thai", flag: "🇹🇭", dish: "🍜" },
  { cuisine: "north-african", flag: "🧆", dish: "🧆" },
  { cuisine: "american", flag: "🇺🇸", dish: "🗽" },
  { cuisine: "chinese", flag: "🇨🇳", dish: "🥡" },
  { cuisine: "greek", flag: "🇬🇷", dish: "🫒" },
  { cuisine: "korean", flag: "🇰🇷", dish: "🥢" },
];

/**
 * A pseudo-random stream from a seed: mulberry32, small and good enough to deal twelve tiles.
 * `Math.random()` would deal a new hand on every render, and the day's hand must hold all day.
 */
const _streamOf = (seed: number) => {
  let state = Math.floor(seed * 2 ** 32) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
};

/**
 * The day's `count` categories for home: a Fisher–Yates shuffle of `EXPLORE_CATEGORIES`, seeded
 * by the day's key (`toDateParam`), so every visit that day sees the same tiles and the next day
 * deals new ones, with nothing stored and no call to the server.
 */
export const featuredCategoriesOf = (dayKey: string, count: number): ExploreCategory[] => {
  const next = _streamOf(seedOfDayKey(dayKey));
  const deck = [...EXPLORE_CATEGORIES];

  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [deck[index], deck[other]] = [deck[other]!, deck[index]!];
  }

  return deck.slice(0, count);
};

/**
 * The cuisine a `?category=` param names, or nothing.
 *
 * Matched against the tiles that exist rather than cast: a link is text anyone can type, and a
 * cuisine with no tile (`fusion`) would select nothing on screen while filtering the grid, which
 * reads as a page that forgot what it was showing.
 */
export const categoryParamOf = (raw: string | string[] | undefined): Cuisine | undefined =>
  EXPLORE_CATEGORIES.find((category) => category.cuisine === raw)?.cuisine;
