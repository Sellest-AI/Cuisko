import { ConvexError } from "convex/values";

import type { Id } from "@convex/_generated/dataModel";
import { getImage } from "@convex/functions/media/getImage";
import { toRecipeCard } from "@convex/functions/recipes/recipeCard";
import type { QueryCtx } from "@convex/procedures";
import type { Locale } from "@convex/schema/i18n";
import type { Allergen } from "@shared/allergens";
import { ceilingMinutesOf, type CookingTime } from "@shared/cookingTimes";
import type { Diet } from "@shared/diets";
import type { Equipment } from "@shared/equipments";
import type { MealSlot } from "@shared/mealSlots";
import type { NutritionPreference } from "@shared/preferences";

import { availableStock } from "./availableStock";
import { candidatePool, OWN_SHARE } from "./candidatePool";
import { draftMealOf, type DraftPlate } from "./draftMealOf";
import { isDistinct, MAX_DAYS, MAX_SERVINGS } from "./limits";
import { selectMeals, type Plate } from "./selectMeals";
import { soonestExpiries } from "./soonestExpiries";
import { spreadMeals } from "./spreadMeals";

type Args = {
  householdId: Id<"households">;
  userId: Id<"users">;
  locale: Locale;
  seed: number;
  servings: number;
  /** Local-day timestamps of the days to plan, in order. The client's, because "Tuesday" is its Tuesday. */
  dates: number[];
  slots: MealSlot[];
  /** Local-day timestamp of today: meals planned from here on still hold their stock. */
  today: number;
  diet: Diet;
  avoids: Allergen[];
  /**
   * How long the cook has this week. Optional, and absent means `any` — no ceiling rather than an
   * infinite one, so an unfiltered run takes the path it took before the time step did anything.
   */
  cookingTime?: CookingTime;
  /**
   * What the kitchen owns. An argument rather than a read of `households.equipments`, for the same
   * reason as the diet: `saveDefaults` writes that column at the moment this query runs. Absent
   * means nobody asked, which filters nothing — see `candidatePool`.
   */
  equipments?: Equipment[];
  /**
   * The caller's nutrition wishes for the run — the focus step's answer. Optional so a client that
   * sends none gets the week it got before the step reached the pool; absent means `[]`.
   */
  seeks?: NutritionPreference[];
  /**
   * When the run began, pinned by the client like `seed`. A recipe written after it is examined
   * after every other, so a write landing while the user reviews the week — their own import from
   * another screen, a catalog batch — re-runs this query without reshuffling it. Optional so a
   * client that sends none gets the pool it got before; absent means nothing is held back.
   */
  startedAt?: number;
};

/**
 * Everything here is the client's, and the plates are `dates × slots`, which multiplies every read
 * below — so each factor is bounded where it cannot be bypassed. A repeated date or slot is refused
 * rather than deduplicated: it would be two plates the client cannot tell apart. `servings` must be
 * a whole number, which also refuses `NaN`, since `NaN` fails no comparison and scales every line
 * to `NaN`. The seed must be the fraction `candidatePool` stretches onto the shuffle key.
 */
const _isValidRequest = ({ dates, slots, servings, seed }: Args) =>
  dates.length <= MAX_DAYS &&
  isDistinct(dates) &&
  isDistinct(slots) &&
  Number.isInteger(servings) &&
  servings >= 1 &&
  servings <= MAX_SERVINGS &&
  seed >= 0 &&
  seed < 1;

/**
 * A generated week, written nowhere.
 *
 * Stock and the soonest date each ingredient goes off first, then the pool, then the pure
 * selection, which prefers what goes off soonest — spread so no two neighbouring plates are the
 * same dish in another recipe's words — then names and images for what was picked
 * and for each plate's alternatives. An alternative costs its plate picture and nothing else: its
 * recipe is already in the pool, and its lines are left for `getDraftMeal` to read if it is chosen.
 * A tunnel abandoned at review has asserted nothing, so this is a query and not a mutation.
 *
 * Everything that decides the draft is an argument — the seed, the days, the run's diet, allergens,
 * cooking time, kitchen and nutrition wishes — rather than read from the stored preferences, which the same generating step is
 * writing at the same moment. Reading them would re-run this query on its own write and reshuffle
 * the week under a user already reviewing it.
 *
 * An empty pool yields an empty week, not a throw: there is nothing wrong with the request, only
 * nothing to plan it from.
 */
export const planDraft = async (ctx: QueryCtx, args: Args): Promise<DraftPlate[]> => {
  if (!_isValidRequest(args)) throw new ConvexError({ code: "INVALID_INPUT" });

  const plates: Plate[] = args.dates.flatMap((date) =>
    args.slots.map((slot) => ({ date, slot, servings: args.servings })),
  );

  if (plates.length === 0) return [];

  const [stock, lots, pool] = await Promise.all([
    availableStock(ctx, args.householdId, args.today),
    ctx.db
      .query("cellarItems")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect(),
    candidatePool(ctx, {
      userId: args.userId,
      seed: args.seed,
      servings: args.servings,
      plates: plates.length,
      diet: args.diet,
      avoids: args.avoids,
      // The margin is applied here, once, so the pool filters on minutes and never on vocabulary.
      // An absent answer and `any` are the same thing, and both reach the pool as no ceiling.
      maxMinutes: ceilingMinutesOf(args.cookingTime ?? "any") ?? undefined,
      equipments: args.equipments,
      seeks: args.seeks ?? [],
      settledAt: args.startedAt,
    }),
  ]);

  const expiries = soonestExpiries(lots);
  const selected = spreadMeals(selectMeals(pool.candidates, stock, plates, { ownShare: OWN_SHARE, expiries }), stock, expiries);

  const recipeIds = [
    ...new Set(selected.flatMap(({ candidate, alternatives }) => [candidate, ...alternatives].map(({ recipeId }) => recipeId))),
  ];
  const ingredientIds = [...new Set(selected.flatMap(({ candidate }) => candidate.needs.map((need) => need.ingredientId)))];

  // Each read once, however many plates repeat a recipe or a line repeats an ingredient.
  const [cards, ingredientImages] = await Promise.all([
    Promise.all(
      recipeIds.map(async (id) => {
        const recipe = pool.recipes.get(id)!;
        const plate = recipe.plateImageId ? await getImage(ctx, recipe.plateImageId) : null;
        return [id, { card: toRecipeCard(recipe, args.locale, null, plate) }] as const;
      }),
    ).then((entries) => new Map(entries)),
    Promise.all(
      ingredientIds.map(async (id) => {
        const imageId = pool.ingredients.get(id)!.imageId;
        const image = imageId ? await getImage(ctx, imageId) : null;
        return [id, image?.sizes.thumbnail.url] as const;
      }),
    ).then((entries) => new Map(entries)),
  ]);

  return selected.map(({ plate, candidate, covered, alternatives }) => ({
    ...draftMealOf({
      plate,
      recipeId: candidate.recipeId,
      card: cards.get(candidate.recipeId)!.card,
      needs: candidate.needs,
      covered,
      ingredients: pool.ingredients,
      ingredientImages,
      locale: args.locale,
    }),
    alternatives: alternatives.map(({ recipeId }) => {
      const { card } = cards.get(recipeId)!;

      return { recipeId, title: card.title, imageUrl: card.plateImageUrl };
    }),
  }));
};
