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

import { emptyLedger, type Ledger, type LedgerRecipe, pendingFor, readLedger, writeLedger } from "../ledger";

const DEV = "dev:happy-otter-123";
const PROD = "prod:calm-heron-456";

const recipe = (overrides: Partial<LedgerRecipe> = {}): LedgerRecipe => ({
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
