/**
 * The catalog ledger: every dish searched and every Marmiton card seen, and where each import landed.
 *
 * It is the first of two duplicate guards, and the cheap one: it saves a search, a fetch and a model
 * call. The second is on the server (`importOne` checks the catalog's `sourceUrl`), so a lost or
 * stale ledger can waste work but can never duplicate a recipe.
 *
 * Committed, because it is also the only record of what was rejected and what failed, and that
 * record should survive a change of machine.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as z from "zod/v4";

import type { AssertTrue, Exact } from "@convex/agent/utils/exact";
import type { RatedRecipe, Verdict } from "@convex/lib/webRecipes/verdicts";
import type { DishConstraints } from "@convex/schema/recipePayloads";
import { CONSTRAINT_TIMES } from "@shared/cookingTimes";
import { type Cuisine, CUISINES } from "@shared/cuisines";
import { CONSTRAINT_DIETS, type ConstraintDiet, fitsDiet } from "@shared/diets";
import { NUTRITION_PREFERENCES } from "@shared/preferences";

import { type ConstraintKey, type HitRate, hitsOf, type RecipeFacts } from "./constraints";

const _importSchema = z.object({
  /** Where it landed, as read from the deploy key: "dev:happy-otter-123". */
  deployment: z.string().min(1),
  recipeId: z.string().min(1),
  at: z.string(),
});

/**
 * The constraints a dish was asked under, as the file holds them. Parsed, not re-checked: the tool
 * refused anything illegal before the dish existed.
 */
const _askedSchema = z.object({
  time: z.enum(CONSTRAINT_TIMES).optional(),
  diet: z.enum(CONSTRAINT_DIETS).optional(),
  seeks: z.array(z.enum(NUTRITION_PREFERENCES)).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a compile-time assertion, read by tsc alone
type _AskedPinned = AssertTrue<Exact<z.infer<typeof _askedSchema>, DishConstraints>>;

/** Where a recipe was found. It decides the locale the import reads the page in. */
export const SOURCES = ["marmiton", "bbcgoodfood"] as const;

export type Source = (typeof SOURCES)[number];

const _recipeSchema = z.object({
  source: z.enum(SOURCES),
  /** The dish whose search found it, or accepted it: a key of `dishes`. */
  dish: z.string(),
  title: z.string(),
  /** The source's rating out of 5, at the time the recipe was seen. */
  rating: z.number(),
  /** The source's count of reviews (a Marmiton "avis", a BBC Good Food rating), when it was seen. */
  reviews: z.number().int().nonnegative(),
  /**
   * What is known about the RECIPE, and never where it landed: that is `imports` (see `pendingFor`).
   *
   * "rejected" failed the bar. "skipped" cleared it but was not its search's best card (`bestCard`):
   * one search contributes one recipe. The two stay apart so that a change to the bar, or to the
   * one-per-search rule, can be re-applied to the ledger without fetching a page again.
   *
   * "excluded" is a verdict on the DISH, written by hand: it is not a plate (`docs/PRODUCT.md`), so
   * the recipe is never pending on any deployment and no later search re-accepts it, however good
   * its rating. Not "rejected", which a later search may still accept, and which says nothing
   * about a recipe already imported and since deleted. `reason` says why.
   */
  status: z.enum(["accepted", "rejected", "skipped", "imported", "failed", "excluded"]),
  error: z.string().optional(),
  reason: z.string().optional(),
  /** One entry per deployment, so a dev id and a prod id never overwrite each other. */
  imports: z.array(_importSchema),
});

const _ledgerSchema = z.object({
  version: z.literal(1),
  /** Index into `ASKED_CUISINES` of the next cuisine to ask dishes for; the run goes round-robin. */
  cuisineCursor: z.number().int().nonnegative(),
  /** Every dish name ever searched, keyed by `dishKeyOf`, so the agent can be told to avoid it. */
  dishes: z.record(
    z.string(),
    z.object({
      cuisine: z.enum(CUISINES),
      /** The dish in English, for matching BBC Good Food slugs. */
      nameEn: z.string().optional(),
      /**
       * Set on a lookup the script made itself, for the vegan version of the dish keyed here. Not a
       * dish the agent proposed, so `coverageOf` leaves it out.
       */
      versionOf: z.string().optional(),
      /** What the agent intended; the real facets are computed at import. */
      diet: z.enum(CONSTRAINT_DIETS).optional(),
      /**
       * The constraints the agent was asked to fit when it proposed the dish, so a run can score
       * each one against the tags the imported recipe came out with. Absent on an unconstrained
       * ask, on the script's own vegan-version lookups, and on every dish searched before asks
       * carried constraints.
       */
      asked: _askedSchema.optional(),
      searchedAt: z.string(),
    }),
  ),
  /**
   * Keyed by canonical URL (`canonicalUrlOf`), the spelling the server stores as `sourceUrl`.
   * Insertion order is kept by JSON and by this schema, and it is the order imports run in.
   */
  recipes: z.record(z.string(), _recipeSchema),
  /**
   * Dishes the agent proposed under a diet they miss by its own answer, by cuisine then by
   * `dishKeyOf`, and never searched. Kept so the next ask under that diet is told to avoid them: the
   * agent's best-known answers come back otherwise, are dropped again, and the ask is wasted. Not in
   * `dishes`, which every ask avoids: ayam taliwang misses a vegan ask and is a fine dish to search
   * for an unconstrained one.
   *
   * By cuisine first because one name can miss in two: "curry de légumes" dropped from an Indian
   * ask, then a Thai one, kept one entry and lost the Indian miss when keyed by the dish alone.
   */
  dietMisses: z
    .partialRecord(
      z.enum(CUISINES),
      z.record(
        z.string(),
        z.object({
          /** The agent's answer: absent when the dish has meat. */
          diet: z.enum(CONSTRAINT_DIETS).optional(),
          missedAt: z.string(),
        }),
      ),
    )
    .optional(),
});

export type Ledger = z.infer<typeof _ledgerSchema>;
export type LedgerRecipe = z.infer<typeof _recipeSchema>;

export const emptyLedger = (): Ledger => ({ version: 1, cuisineCursor: 0, dishes: {}, recipes: {} });

/**
 * The ledger at `file`, or an empty one if the file does not exist yet.
 *
 * Validated rather than cast: the file is committed and can be edited by hand or merged, and a
 * malformed entry found halfway through a run would be found after the run had spent money.
 */
export const readLedger = (file: string): Ledger => {
  if (!existsSync(file)) return emptyLedger();

  const parsed = _ledgerSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${file} is not a valid catalog ledger:\n${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
};

/**
 * Writes the ledger to `file`.
 *
 * Through a temporary file and a rename, because the script writes after every recipe, and an
 * interruption while the file is being written would otherwise leave a truncated ledger in place.
 */
export const writeLedger = (file: string, ledger: Ledger): void => {
  const temporary = `${file}.tmp`;
  const json = `${JSON.stringify(ledger, null, 2)}\n`;
  whileLocked(() => writeFileSync(temporary, json));
  whileLocked(() => renameSync(temporary, file));
};

/** The codes Windows answers a write or a rename with while another process holds the file open. */
const _LOCKED_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const _LOCK_TRIES = 20;
const _LOCK_WAIT_MS = 100;

/**
 * `operation` (a write, a rename), tried again for up to two seconds while its file is locked.
 * `waitMs` is the pause between tries, a parameter so a test need not sleep through a real lock.
 *
 * Windows refuses to write or rename onto a file another process has open, for as long as it has
 * it: an editor reloading the ledger it shows, an antivirus scanning the file just written. The run
 * writes after every search, so a lock lasting a moment ended a run (EPERM), or cost a dish its
 * remaining lookups, with nothing wrong with either. Any other error, or a lock that outlasts the
 * retries, is thrown as before.
 */
export const whileLocked = (operation: () => void, waitMs = _LOCK_WAIT_MS): void => {
  for (let attempt = 1; ; attempt++) {
    try {
      operation();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= _LOCK_TRIES || !code || !_LOCKED_CODES.has(code)) throw error;
      // A synchronous wait: `writeLedger` is synchronous, and every caller relies on the file
      // being written when it returns.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
};

/**
 * The URLs still to import on `deployment`, in ledger order.
 *
 * Read from `imports`, not from `status` alone: a recipe imported on dev has status "imported" and
 * is still pending for prod. A "failed" or "excluded" recipe is never pending, on any deployment.
 * It stays in the ledger with its error or reason, and a re-run moves on to other recipes.
 */
export const pendingFor = (ledger: Ledger, deployment: string): string[] =>
  Object.entries(ledger.recipes)
    .filter(
      ([, recipe]) =>
        (recipe.status === "accepted" || recipe.status === "imported") &&
        !recipe.imports.some((landed) => landed.deployment === deployment),
    )
    .map(([url]) => url);

/** Every cuisine but "other", which names no cuisine a cook could be asked dishes from. */
export const ASKED_CUISINES = CUISINES.filter((cuisine) => cuisine !== "other");

/**
 * The cuisine to ask dishes for next, and the cursor moved past it.
 *
 * Round-robin, so a run that stops early still spreads the catalog across cuisines, and the next
 * run starts where it stopped.
 */
export const nextCuisine = (ledger: Ledger): Cuisine => {
  const cuisine = ASKED_CUISINES[ledger.cuisineCursor % ASKED_CUISINES.length]!;
  ledger.cuisineCursor = (ledger.cuisineCursor + 1) % ASKED_CUISINES.length;

  return cuisine;
};

/**
 * The spelling a dish is stored and compared under. The agent does not keep to one: "Pad thaï"
 * in one answer, "pad thaï" in the next, and the ï as one character or as two.
 */
export const dishKeyOf = (name: string): string => name.trim().normalize("NFC").toLocaleLowerCase("fr");

/**
 * What the agent is told not to suggest for `cuisine`: its dishes already searched, the titles of
 * its recipes already imported, and, under a diet, the dishes it proposed before that miss it.
 *
 * Scoped to the cuisine, because a Thai dish name tells the model nothing when it is suggesting
 * Peruvian ones, and a list across every cuisine would grow with every run.
 */
export const avoidFor = (ledger: Ledger, cuisine: Cuisine, diet?: ConstraintDiet): string[] => {
  // The script's own vegan-version lookups are left out: the agent never proposed them.
  const dishes = Object.keys(ledger.dishes).filter(
    (dish) => ledger.dishes[dish]!.cuisine === cuisine && !ledger.dishes[dish]!.versionOf,
  );
  const titles = Object.values(ledger.recipes)
    .filter((recipe) => recipe.status === "imported" && ledger.dishes[recipe.dish]?.cuisine === cuisine)
    .map((recipe) => recipe.title);

  const misses = diet
    ? Object.entries(ledger.dietMisses?.[cuisine] ?? {})
        .filter(([, miss]) => !fitsDiet(miss.diet, diet))
        .map(([dish]) => dish)
    : [];

  return [...new Set([...dishes, ...titles, ...misses])];
};

/**
 * Records a dish the agent proposed under a diet it misses by its own answer (`fitsDiet`), so
 * `avoidFor` lists it on the next ask under that diet. Never searched, so not a `dishes` entry.
 */
export const recordDietMiss = (
  ledger: Ledger,
  { dish, cuisine, diet, missedAt }: { dish: string; cuisine: Cuisine; diet?: ConstraintDiet; missedAt: string },
): void => {
  ledger.dietMisses = {
    ...ledger.dietMisses,
    [cuisine]: { ...ledger.dietMisses?.[cuisine], [dishKeyOf(dish)]: { ...(diet && { diet }), missedAt } },
  };
};

export type SearchedCard = RatedRecipe & { verdict: Verdict };

export type DishSearch = {
  dish: string;
  source: Source;
  cuisine: Cuisine;
  nameEn?: string;
  versionOf?: string;
  diet?: ConstraintDiet;
  asked?: DishConstraints;
  searchedAt: string;
};

/**
 * Records one search: the dish, and every recipe it found, with the verdict each got.
 *
 * One dish can be searched on both sources (BBC Good Food when Marmiton had nothing), and each
 * search records its own recipes under the same dish.
 *
 * A URL already in the ledger keeps its entry. The only exception is a card no earlier search
 * accepted ("skipped" or "rejected") that this search accepts: a variation searched by name
 * ("lasagnes au saumon") can pick up a card the generic search passed over. An entry that is
 * accepted, imported, failed or excluded is never touched, so a re-run cannot undo an import, and
 * cannot bring back a dish that was ruled out by hand.
 */
export const recordSearch = (
  ledger: Ledger,
  { dish, source, ...search }: DishSearch,
  cards: readonly SearchedCard[],
): void => {
  const key = dishKeyOf(dish);
  ledger.dishes[key] = search;

  for (const { url, verdict, title, rating, reviews } of cards) {
    const known = ledger.recipes[url];
    const seen = { dish: key, source, title, rating, reviews };

    if (!known) {
      ledger.recipes[url] = { ...seen, status: verdict, imports: [] };
    } else if (verdict === "accepted" && (known.status === "skipped" || known.status === "rejected")) {
      ledger.recipes[url] = { ...known, ...seen, status: "accepted" };
    }
  }
};

const _recipeAt = (ledger: Ledger, url: string): LedgerRecipe => {
  const recipe = ledger.recipes[url];
  if (!recipe) throw new Error(`${url} is not in the catalog ledger`);

  return recipe;
};

/** Records that `url` landed on a deployment. A failure recorded on an earlier run is cleared. */
export const recordImport = (
  ledger: Ledger,
  url: string,
  landed: { deployment: string; recipeId: string; at: string },
): void => {
  const { error: _cleared, ...recipe } = _recipeAt(ledger, url);
  ledger.recipes[url] = { ...recipe, status: "imported", imports: [...recipe.imports, landed] };
};

/** Records that importing `url` failed. It is never pending again (`pendingFor`). */
export const recordFailure = (ledger: Ledger, url: string, error: string): void => {
  ledger.recipes[url] = { ..._recipeAt(ledger, url), status: "failed", error };
};

/**
 * How far the dish list has spread: the cuisines with at least one dish searched, and the share of
 * dishes the agent meant as vegan. The two numbers the plan measures a full run by. Only the
 * agent's dishes count, not the vegan versions the script looked up for them.
 */
export const coverageOf = (ledger: Ledger) => {
  const dishes = Object.values(ledger.dishes).filter((dish) => !dish.versionOf);

  return {
    cuisines: new Set(dishes.map((dish) => dish.cuisine)).size,
    ofCuisines: ASKED_CUISINES.length,
    dishes: dishes.length,
    vegan: dishes.filter((dish) => dish.diet === "vegan").length,
  };
};

/**
 * Per constraint value, how many dishes asked under it were imported on `deployment`, and how many
 * of those came out fitting it. The weights the rotation draws by (`weightsOf`).
 *
 * `factsById` is the catalog read back from the deployment, keyed by recipe id: the tags are
 * computed at import, and the ledger never holds them. A recipe no longer there (deleted, or
 * archived) is not counted, rather than counted as a miss. Each value of a pair is scored on its
 * own: a dish asked high-protein and low-carb counts toward both.
 */
export const hitRatesOf = (
  ledger: Ledger,
  deployment: string,
  factsById: ReadonlyMap<string, RecipeFacts>,
): Map<ConstraintKey, HitRate> => {
  const rates = new Map<ConstraintKey, HitRate>();

  for (const recipe of Object.values(ledger.recipes)) {
    const asked = ledger.dishes[recipe.dish]?.asked;
    const landed = recipe.imports.find((entry) => entry.deployment === deployment);
    const facts = landed && factsById.get(landed.recipeId);
    if (!asked || !facts) continue;

    for (const [key, hit] of hitsOf(asked, facts)) {
      const rate = rates.get(key) ?? { asked: 0, hit: 0 };
      rates.set(key, { asked: rate.asked + 1, hit: rate.hit + (hit ? 1 : 0) });
    }
  }

  return rates;
};
