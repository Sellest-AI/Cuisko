/**
 * The ledger's contract: what is still to import on a deployment, and a file that survives the run.
 *
 * The cases that matter are the ones where dev and prod disagree. The same URL is imported once per
 * deployment, and a mistake here either re-imports a recipe on every run or never sends it to prod.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ASKED_CUISINES,
  avoidFor,
  coverageOf,
  dishKeyOf,
  emptyLedger,
  hitRatesOf,
  type Ledger,
  type LedgerRecipe,
  nextCuisine,
  pendingFor,
  readLedger,
  recordDietMiss,
  recordFailure,
  recordImport,
  recordSearch,
  whileLocked,
  type SearchedCard,
  writeLedger,
} from "../ledger";

const DEV = "dev:happy-otter-123";
const PROD = "prod:calm-heron-456";

const recipe = (overrides: Partial<LedgerRecipe> = {}): LedgerRecipe => ({
  source: "marmiton",
  dish: "pad thaï",
  title: "Pad thaï",
  rating: 4.8,
  reviews: 120,
  status: "accepted",
  imports: [],
  ...overrides,
});

const landed = (deployment: string, recipeId = "k17abc") => ({ deployment, recipeId, at: "2026-09-21T10:00:00.000Z" });

const ledgerOf = (recipes: Record<string, LedgerRecipe>): Ledger => ({ ...emptyLedger(), recipes });

describe("pendingFor", () => {
  it("returns accepted recipes with no import yet, in ledger order", () => {
    const ledger = ledgerOf({ "https://m.org/b": recipe(), "https://m.org/a": recipe() });

    expect(pendingFor(ledger, DEV)).toEqual(["https://m.org/b", "https://m.org/a"]);
  });

  it("does not mark prod done when a recipe was imported on dev", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "imported", imports: [landed(DEV)] }) });

    expect(pendingFor(ledger, DEV)).toEqual([]);
    expect(pendingFor(ledger, PROD)).toEqual(["https://m.org/a"]);
  });

  it("ignores imports recorded for another deployment", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "imported", imports: [landed(PROD)] }) });

    expect(pendingFor(ledger, DEV)).toEqual(["https://m.org/a"]);
  });

  it("never returns a failed recipe, on any deployment", () => {
    const ledger = ledgerOf({
      "https://m.org/a": recipe({ status: "failed", error: "no ingredients found" }),
      "https://m.org/b": recipe({ status: "failed", error: "timeout", imports: [landed(DEV)] }),
    });

    expect(pendingFor(ledger, DEV)).toEqual([]);
    expect(pendingFor(ledger, PROD)).toEqual([]);
  });

  it("never returns a recipe the bar rejected", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "rejected", rating: 4.3, reviews: 54 }) });

    expect(pendingFor(ledger, DEV)).toEqual([]);
  });

  it("never returns a recipe that cleared the bar but was not its search's best card", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "skipped" }) });

    expect(pendingFor(ledger, DEV)).toEqual([]);
  });

  it("never returns an excluded recipe, even one that landed on dev before being ruled out", () => {
    const ledger = ledgerOf({
      "https://m.org/a": recipe({ status: "excluded", reason: "dessert" }),
      "https://m.org/b": recipe({ status: "excluded", reason: "dessert", imports: [landed(DEV)] }),
    });

    expect(pendingFor(ledger, DEV)).toEqual([]);
    expect(pendingFor(ledger, PROD)).toEqual([]);
  });
});

describe("readLedger / writeLedger", () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "cuisko-ledger-"));
    file = path.join(directory, "catalog.ledger.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads a missing file as an empty ledger, so the first run needs no setup", () => {
    expect(readLedger(file)).toEqual(emptyLedger());
  });

  it("reads back what it wrote, key order included, and leaves no temporary file", () => {
    const ledger: Ledger = {
      version: 1,
      cuisineCursor: 3,
      dishes: { "pad thaï": { cuisine: "thai", searchedAt: "2026-09-21T10:00:00.000Z" } },
      recipes: {
        "https://m.org/b": recipe({ status: "imported", imports: [landed(DEV)] }),
        "https://m.org/a": recipe({ status: "rejected" }),
      },
    };

    writeLedger(file, ledger);

    expect(readLedger(file)).toEqual(ledger);
    expect(Object.keys(readLedger(file).recipes)).toEqual(["https://m.org/b", "https://m.org/a"]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it("refuses a file that is not a ledger, naming the file and the bad field", () => {
    writeFileSync(file, JSON.stringify({ ...emptyLedger(), version: 2 }));

    expect(() => readLedger(file)).toThrow(/catalog\.ledger\.json is not a valid catalog ledger[\s\S]*version/);
  });

  it("refuses a dish whose cuisine is not in CUISINES", () => {
    writeFileSync(
      file,
      JSON.stringify({ ...emptyLedger(), dishes: { tacos: { cuisine: "tex-mex", searchedAt: "2026-09-21" } } }),
    );

    expect(() => readLedger(file)).toThrow(/cuisine/);
  });

  /** The committed ledger holds hundreds of dishes searched before asks carried constraints. */
  it("reads a dish with no constraints, as every dish before them was written", () => {
    writeFileSync(
      file,
      JSON.stringify({ ...emptyLedger(), dishes: { dal: { cuisine: "indian", searchedAt: "2026-09-21" } } }),
    );

    expect(readLedger(file).dishes["dal"]).toEqual({ cuisine: "indian", searchedAt: "2026-09-21" });
  });

  it("reads back the constraints a dish was asked under", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      dishes: {
        "chana masala": {
          cuisine: "indian",
          asked: { diet: "vegan", seeks: ["high-protein", "high-fibre"] },
          searchedAt: "2026-09-21",
        },
      },
    };

    writeLedger(file, ledger);

    expect(readLedger(file)).toEqual(ledger);
  });

  it("reads back the dishes that missed a diet", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      dietMisses: { indonesian: { "gulai kambing": { missedAt: "2026-10-19" } } },
    };

    writeLedger(file, ledger);

    expect(readLedger(file)).toEqual(ledger);
  });

  it("refuses a constraint the tool could never have asked under", () => {
    writeFileSync(
      file,
      JSON.stringify({
        ...emptyLedger(),
        dishes: { dal: { cuisine: "indian", asked: { time: "any" }, searchedAt: "2026-09-21" } },
      }),
    );

    expect(() => readLedger(file)).toThrow(/time/);
  });
});

const SEARCHED_AT = "2026-09-21T10:00:00.000Z";

const card = (url: string, verdict: SearchedCard["verdict"], title = "Pad thaï"): SearchedCard => ({
  url,
  title,
  rating: 4.8,
  reviews: 120,
  verdict,
});

describe("nextCuisine", () => {
  it("goes round the cuisines in order and wraps, never asking for 'other'", () => {
    const ledger = emptyLedger();
    const asked = Array.from({ length: ASKED_CUISINES.length + 1 }, () => nextCuisine(ledger));

    expect(asked).toEqual([...ASKED_CUISINES, ASKED_CUISINES[0]]);
    expect(asked).not.toContain("other");
    expect(ledger.cuisineCursor).toBe(1);
  });
});

describe("dishKeyOf", () => {
  it("stores one dish under one key, whatever the case, spacing or ï encoding", () => {
    expect(dishKeyOf(" Pad Thaï ")).toBe(dishKeyOf("pad thaï"));
  });
});

describe("recordSearch", () => {
  it("records the dish under its key and every card with its verdict", () => {
    const ledger = emptyLedger();

    recordSearch(ledger, { dish: "Pad Thaï", source: "marmiton", cuisine: "thai", searchedAt: SEARCHED_AT }, [
      card("https://m.org/a", "accepted"),
      card("https://m.org/b", "skipped"),
      card("https://m.org/c", "rejected"),
    ]);

    expect(ledger.dishes).toEqual({ "pad thaï": { cuisine: "thai", searchedAt: SEARCHED_AT } });
    expect(Object.values(ledger.recipes).map((recipe) => [recipe.dish, recipe.status])).toEqual([
      ["pad thaï", "accepted"],
      ["pad thaï", "skipped"],
      ["pad thaï", "rejected"],
    ]);
  });

  it("records the constraints the dish was asked under", () => {
    const ledger = emptyLedger();

    recordSearch(
      ledger,
      { dish: "Pad Thaï", source: "marmiton", cuisine: "thai", asked: { time: "30" }, searchedAt: SEARCHED_AT },
      [card("https://m.org/a", "accepted")],
    );

    expect(ledger.dishes["pad thaï"]?.asked).toEqual({ time: "30" });
  });

  it("accepts a card an earlier search skipped, under the dish that accepted it", () => {
    const ledger = emptyLedger();
    recordSearch(ledger, { dish: "lasagnes", source: "marmiton", cuisine: "italian", searchedAt: SEARCHED_AT }, [
      card("https://m.org/saumon", "skipped", "Lasagnes au saumon"),
    ]);

    recordSearch(ledger, { dish: "lasagnes au saumon", source: "marmiton", cuisine: "italian", searchedAt: SEARCHED_AT }, [
      card("https://m.org/saumon", "accepted", "Lasagnes au saumon"),
    ]);

    expect(ledger.recipes["https://m.org/saumon"]).toMatchObject({ dish: "lasagnes au saumon", status: "accepted" });
  });

  it("never touches an imported or failed entry, so a re-run cannot undo an import", () => {
    const imported = recipe({ status: "imported", imports: [landed(DEV)] });
    const failed = recipe({ status: "failed", error: "timeout" });
    const ledger = ledgerOf({ "https://m.org/a": imported, "https://m.org/b": failed });

    recordSearch(ledger, { dish: "pad thaï", source: "marmiton", cuisine: "thai", searchedAt: SEARCHED_AT }, [
      card("https://m.org/a", "rejected"),
      card("https://m.org/b", "accepted"),
    ]);

    expect(ledger.recipes["https://m.org/a"]).toEqual(imported);
    expect(ledger.recipes["https://m.org/b"]).toEqual(failed);
  });

  it("never re-accepts an excluded entry, however well its card rates", () => {
    const excluded = recipe({ status: "excluded", reason: "dessert", rating: 4.9, reviews: 3_000 });
    const ledger = ledgerOf({ "https://m.org/a": excluded });

    recordSearch(ledger, { dish: "tiramisu", source: "marmiton", cuisine: "italian", searchedAt: SEARCHED_AT }, [
      card("https://m.org/a", "accepted"),
    ]);

    expect(ledger.recipes["https://m.org/a"]).toEqual(excluded);
  });

  it("does not demote an accepted entry that a later search only skips", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe() });

    recordSearch(ledger, { dish: "nouilles sautées", source: "marmiton", cuisine: "thai", searchedAt: SEARCHED_AT }, [
      card("https://m.org/a", "skipped"),
    ]);

    expect(ledger.recipes["https://m.org/a"]).toMatchObject({ dish: "pad thaï", status: "accepted" });
  });
});

describe("recordImport and recordFailure", () => {
  it("adds a deployment to the imports without dropping the other one", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "imported", imports: [landed(DEV)] }) });

    recordImport(ledger, "https://m.org/a", landed(PROD, "k17prod"));

    expect(ledger.recipes["https://m.org/a"]!.imports).toEqual([landed(DEV), landed(PROD, "k17prod")]);
    expect(pendingFor(ledger, PROD)).toEqual([]);
  });

  it("clears the error a failed attempt left behind", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe({ status: "failed", error: "timeout" }) });

    recordImport(ledger, "https://m.org/a", landed(DEV));

    expect(ledger.recipes["https://m.org/a"]).not.toHaveProperty("error");
    expect(ledger.recipes["https://m.org/a"]!.status).toBe("imported");
  });

  it("records a failure with its message, and the recipe is no longer pending", () => {
    const ledger = ledgerOf({ "https://m.org/a": recipe() });

    recordFailure(ledger, "https://m.org/a", "Not a recipe page");

    expect(ledger.recipes["https://m.org/a"]).toMatchObject({ status: "failed", error: "Not a recipe page" });
    expect(pendingFor(ledger, DEV)).toEqual([]);
  });

  it("throws on a url the ledger does not hold, rather than inventing an entry", () => {
    expect(() => recordImport(emptyLedger(), "https://m.org/x", landed(DEV))).toThrow(/not in the catalog ledger/);
  });
});

describe("avoidFor", () => {
  it("lists this cuisine's searched dishes and imported titles, and nothing from another cuisine", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      dishes: {
        "pad thaï": { cuisine: "thai", searchedAt: SEARCHED_AT },
        "ceviche": { cuisine: "peruvian", searchedAt: SEARCHED_AT },
        "vegan pad thai": { cuisine: "thai", versionOf: "pad thaï", searchedAt: SEARCHED_AT },
      },
      recipes: {
        "https://m.org/a": recipe({ title: "Pad thaï aux crevettes", status: "imported", imports: [landed(DEV)] }),
        "https://m.org/b": recipe({ title: "Pad thaï au poulet", status: "accepted" }),
        "https://m.org/c": recipe({ dish: "ceviche", title: "Ceviche de dorade", status: "imported" }),
      },
    };

    expect(avoidFor(ledger, "thai")).toEqual(["pad thaï", "Pad thaï aux crevettes"]);
  });
});

/**
 * Asked for vegan Indonesian dishes, the agent returned chicken, duck and goat. Dropped without a
 * trace, the same three came back on the next vegan ask, and were dropped again.
 */
describe("avoidFor, the dishes that missed a diet", () => {
  const ledger = emptyLedger();
  recordDietMiss(ledger, { dish: "Ayam taliwang", cuisine: "indonesian", missedAt: SEARCHED_AT });
  recordDietMiss(ledger, { dish: "martabak telur", cuisine: "indonesian", diet: "vegetarian", missedAt: SEARCHED_AT });
  recordDietMiss(ledger, { dish: "pad krapow", cuisine: "thai", missedAt: SEARCHED_AT });

  it("lists, under a diet, every dish of the cuisine that misses it", () => {
    expect(avoidFor(ledger, "indonesian", "vegan")).toEqual(["ayam taliwang", "martabak telur"]);
  });

  it("leaves out a dish that fits the diet asked, though it missed a stricter one", () => {
    expect(avoidFor(ledger, "indonesian", "vegetarian")).toEqual(["ayam taliwang"]);
  });

  /** Ayam taliwang misses a vegan ask and is a fine dish to search for an unconstrained one. */
  it("lists none of them when no diet is asked", () => {
    expect(avoidFor(ledger, "indonesian")).toEqual([]);
  });

  it("keeps a dish missed in two cuisines as a miss in both", () => {
    const both = emptyLedger();
    recordDietMiss(both, { dish: "curry de légumes", cuisine: "indian", diet: "vegetarian", missedAt: SEARCHED_AT });
    recordDietMiss(both, { dish: "curry de légumes", cuisine: "thai", diet: "vegetarian", missedAt: SEARCHED_AT });

    expect(avoidFor(both, "indian", "vegan")).toEqual(["curry de légumes"]);
    expect(avoidFor(both, "thai", "vegan")).toEqual(["curry de légumes"]);
  });

  it("records the agent's answer, and an empty ledger holds no misses", () => {
    expect(ledger.dietMisses?.indonesian?.["ayam taliwang"]).toEqual({ missedAt: SEARCHED_AT });
    expect(emptyLedger().dietMisses).toBeUndefined();
  });
});

describe("coverageOf", () => {
  it("counts cuisines with a dish and the dishes meant as vegan", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      dishes: {
        "pad thaï": { cuisine: "thai", searchedAt: SEARCHED_AT },
        "curry vert de légumes": { cuisine: "thai", diet: "vegan", searchedAt: SEARCHED_AT },
        "ratatouille": { cuisine: "french", diet: "vegan", searchedAt: SEARCHED_AT },
        "gratin dauphinois": { cuisine: "french", diet: "vegetarian", searchedAt: SEARCHED_AT },
      },
    };

    expect(coverageOf(ledger)).toEqual({ cuisines: 2, ofCuisines: ASKED_CUISINES.length, dishes: 4, vegan: 2 });
  });

  it("leaves out the vegan versions the script looked up, which the agent never proposed", () => {
    const ledger: Ledger = {
      ...emptyLedger(),
      dishes: {
        "shepherd's pie": { cuisine: "british", nameEn: "shepherd's pie", searchedAt: SEARCHED_AT },
        "vegan shepherd's pie": { cuisine: "british", versionOf: "shepherd's pie", searchedAt: SEARCHED_AT },
      },
    };

    expect(coverageOf(ledger)).toMatchObject({ dishes: 1, vegan: 0 });
  });
});

describe("recordSearch across sources", () => {
  it("records a dish's BBC Good Food lookup under the same dish, with its source", () => {
    const ledger = emptyLedger();
    const search = { dish: "bibimbap", cuisine: "korean", nameEn: "bibimbap", searchedAt: SEARCHED_AT } as const;

    recordSearch(ledger, { ...search, source: "marmiton" }, [card("https://m.org/a", "rejected", "Bibimbap")]);
    recordSearch(ledger, { ...search, source: "bbcgoodfood" }, [card("https://bbc.org/b", "accepted", "Bibimbap")]);

    expect(Object.keys(ledger.dishes)).toEqual(["bibimbap"]);
    expect(ledger.dishes.bibimbap).toMatchObject({ nameEn: "bibimbap" });
    expect(Object.values(ledger.recipes).map((found) => [found.dish, found.source, found.status])).toEqual([
      ["bibimbap", "marmiton", "rejected"],
      ["bibimbap", "bbcgoodfood", "accepted"],
    ]);
  });

  it("keeps a page's diet out of the recipe entry, whose shape the ledger file validates", () => {
    const ledger = emptyLedger();

    recordSearch(ledger, { dish: "bibimbap", source: "bbcgoodfood", cuisine: "korean", searchedAt: SEARCHED_AT }, [
      { ...card("https://bbc.org/b", "accepted", "Bibimbap"), diet: "vegetarian" } as SearchedCard,
    ]);

    expect(ledger.recipes["https://bbc.org/b"]).not.toHaveProperty("diet");
  });
});

describe("hitRatesOf", () => {
  const ASKED_AT = "2026-10-19T10:00:00.000Z";

  /** A ledger with one imported recipe per dish, each landed on `deployment` as `recipeId`. */
  const _ledgerOf = (dishes: { dish: string; asked?: Ledger["dishes"][string]["asked"]; landed: ReturnType<typeof landed>[] }[]) => {
    const ledger = emptyLedger();
    for (const { dish, asked, landed: imports } of dishes) {
      ledger.dishes[dish] = { cuisine: "indian", ...(asked && { asked }), searchedAt: ASKED_AT };
      ledger.recipes[`https://m.org/${dish}`] = recipe({ dish, status: "imported", imports });
    }
    return ledger;
  };

  it("scores each value of a pair on its own", () => {
    const ledger = _ledgerOf([
      { dish: "chana masala", asked: { seeks: ["high-protein", "high-fibre"] }, landed: [landed(DEV, "r1")] },
    ]);
    const facts = new Map([["r1", { tags: ["high-fibre" as const] }]]);

    expect(hitRatesOf(ledger, DEV, facts)).toEqual(
      new Map([
        ["seeks:high-protein", { asked: 1, hit: 0 }],
        ["seeks:high-fibre", { asked: 1, hit: 1 }],
      ]),
    );
  });

  it("counts only the recipes imported on that deployment", () => {
    const ledger = _ledgerOf([
      { dish: "dal", asked: { diet: "vegan" }, landed: [landed(DEV, "r1")] },
      { dish: "korma", asked: { diet: "vegan" }, landed: [landed(PROD, "r2")] },
    ]);
    const facts = new Map([
      ["r1", { tags: ["vegan" as const] }],
      ["r2", { tags: [] }],
    ]);

    expect(hitRatesOf(ledger, DEV, facts).get("diet:vegan")).toEqual({ asked: 1, hit: 1 });
  });

  it("leaves out a dish asked under nothing, and a recipe gone from the catalog", () => {
    const ledger = _ledgerOf([
      { dish: "biryani", landed: [landed(DEV, "r1")] },
      { dish: "tikka", asked: { seeks: ["low-carb"] }, landed: [landed(DEV, "deleted")] },
    ]);

    expect(hitRatesOf(ledger, DEV, new Map([["r1", { tags: [] }]])).size).toBe(0);
  });

  /** The planner's filter: an untimed recipe gets into a timed week, so it counts as fitting. */
  it("scores a time by the planner's ceiling, margin included, and an untimed recipe as fitting", () => {
    const ledger = _ledgerOf([
      { dish: "omelette", asked: { time: "20" }, landed: [landed(DEV, "r1")] },
      { dish: "curry", asked: { time: "20" }, landed: [landed(DEV, "r2")] },
      { dish: "khichdi", asked: { time: "20" }, landed: [landed(DEV, "r3")] },
    ]);
    const facts = new Map([
      ["r1", { tags: [], totalMinutes: 24 }],
      ["r2", { tags: [], totalMinutes: 25 }],
      ["r3", { tags: [] }],
    ]);

    expect(hitRatesOf(ledger, DEV, facts).get("time:20")).toEqual({ asked: 3, hit: 2 });
  });

  it("scores a vegan recipe as fitting a vegetarian ask, since the diet tags nest", () => {
    const ledger = _ledgerOf([{ dish: "dal", asked: { diet: "vegetarian" }, landed: [landed(DEV, "r1")] }]);
    const facts = new Map([["r1", { tags: ["vegan" as const, "vegetarian" as const, "pescatarian" as const] }]]);

    expect(hitRatesOf(ledger, DEV, facts).get("diet:vegetarian")).toEqual({ asked: 1, hit: 1 });
  });
});

/** A run died on EPERM: Windows refused the ledger's write while another process held it open. */
describe("whileLocked", () => {
  /** An operation failing with `codes` in turn, then succeeding once they run out. */
  const _failing = (codes: string[]) => {
    const calls: number[] = [];
    const operation = () => {
      calls.push(calls.length);
      const code = codes[calls.length - 1];
      if (code !== undefined) throw Object.assign(new Error(code), { code });
    };
    return { operation, calls };
  };

  it("tries again while the file is locked, and goes through once it is free", () => {
    const { operation, calls } = _failing(["EPERM", "EBUSY"]);

    whileLocked(operation, 0);

    expect(calls).toHaveLength(3);
  });

  it("throws any other error at once", () => {
    const { operation, calls } = _failing(["ENOENT"]);

    expect(() => whileLocked(operation, 0)).toThrow("ENOENT");
    expect(calls).toHaveLength(1);
  });

  it("gives up on a lock that never lifts", () => {
    const { operation } = _failing(Array.from({ length: 50 }, () => "EPERM"));

    expect(() => whileLocked(operation, 0)).toThrow("EPERM");
  });
});
