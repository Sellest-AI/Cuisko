import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/procedures";
import type { Cuisine } from "@shared/cuisines";

type WindowCtx = Pick<QueryCtx, "db">;

/**
 * Which recipes a window ranges over: an index, and the equality prefix that comes before its
 * `shuffleKey`.
 *
 * A closed union rather than a free index name, because the prefix IS the access rule: `userId` is
 * the first field of both and never relaxed, and a shuffle over the bare key would hand a caller
 * other cooks' private recipes. The cuisine range takes no owner: only the catalog is browsed by
 * cuisine.
 */
export type ShuffledRange =
  | { index: "by_user_and_is_archived_and_shuffle_key"; userId: Id<"users"> | undefined }
  | { index: "by_user_and_is_archived_and_cuisine_and_shuffle_key"; userId: undefined; cuisine: Cuisine };

/** The span `randomShuffleKey` draws from: every unsigned 32-bit integer. */
const SHUFFLE_KEY_SPAN = 2 ** 32;

/** One side of the seed, `after` it or up to it, in key order, at most `size` rows. */
const _side = (ctx: WindowCtx, range: ShuffledRange, side: "after" | "upTo", start: number, size: number) => {
  if (range.index === "by_user_and_is_archived_and_shuffle_key") {
    return ctx.db
      .query("recipes")
      .withIndex(range.index, (q) => {
        const prefix = q.eq("userId", range.userId).eq("isArchived", false);
        return side === "after" ? prefix.gt("shuffleKey", start) : prefix.lte("shuffleKey", start);
      })
      .take(size);
  }

  return ctx.db
    .query("recipes")
    .withIndex(range.index, (q) => {
      const prefix = q.eq("userId", range.userId).eq("isArchived", false).eq("cuisine", range.cuisine);
      return side === "after" ? prefix.gt("shuffleKey", start) : prefix.lte("shuffleKey", start);
    })
    .take(size);
};

/**
 * Up to `size` live recipes of a range, from a random point of its `shuffleKey`, wrapping once to
 * the start when the range past the seed comes up short. The planner's pool and the Explore
 * shelves both draw from it, so the same seed is the same order wherever it is read.
 *
 * The seed is a fraction and the keys are 32-bit integers, so it is stretched onto the key's span
 * first. Compared raw, every key but `0` sits past it: the window always opened at the lowest key,
 * the same week came back every run, and nothing past the first `size` keys was ever drawn.
 *
 * @limitation Two reads, so no cursor can carry a page across the wrap: a caller takes one window,
 * never pages through it. The Explore page shows a fixed page for that reason.
 */
export const shuffledWindow = async (
  ctx: WindowCtx,
  { range, seed, size }: { range: ShuffledRange; seed: number; size: number },
): Promise<Doc<"recipes">[]> => {
  const start = Math.floor(seed * SHUFFLE_KEY_SPAN);

  const after = await _side(ctx, range, "after", start, size);
  if (after.length === size) return after;

  const before = await _side(ctx, range, "upTo", start, size - after.length);

  return [...after, ...before];
};
