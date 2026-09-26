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
  type Ledger,
  type LedgerRecipe,
  nextCuisine,
  pendingFor,
  readLedger,
  recordFailure,
  recordImport,
  recordSearch,
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
