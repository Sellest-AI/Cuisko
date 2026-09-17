import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Id } from "@convex/_generated/dataModel";
import type { SanitizedRecipe } from "@convex/agent/tools/sanitizeRecipe";

import {
  MAX_JUDGEMENTS,
  MAX_WALKS,
  resolveRecipeIngredients,
} from "../resolveRecipeIngredients";

/**
 * The walk itself is mocked, and that is the point of this file.
 *
 * What `gatherEvidence` and `resolveWithAgent` answer is settled in
 * `functions/ingredients/__tests__` against the real catalog, the real taxonomy and the real
 * thresholds. What is NOT settled anywhere else is the thing this file owns: how many times each
 * is called, in which pass, for which names, and what happens to the recipe when one of them
 * refuses or throws. All four of those are invisible through a real walk and exact through a mock.
 */
const gather = vi.hoisted(() => vi.fn());
const agent = vi.hoisted(() => vi.fn());

vi.mock("@convex/functions/ingredients/resolveIngredient", () => ({
  gatherEvidence: gather,
  resolveWithAgent: agent,
}));

/** Nothing in this file reaches the database or the scheduler — the two collaborators are mocks. */
const ctx = {} as Parameters<typeof resolveRecipeIngredients>[0];

const id = (value: string) => value as Id<"ingredients">;

const NO_EVIDENCE = { candidates: [], hits: [] };

/** Pass one declined: no answer, so the name goes on to the model. */
const undecided = () => ({ resolved: undefined, evidence: NO_EVIDENCE });

const recipeOf = (ingredients: SanitizedRecipe["ingredients"]): SanitizedRecipe => ({
  title: "Soupe à l'oignon",
  description: "Une soupe d'hiver.",
  servings: 4,
  difficulty: 2,
  cuisine: "french",
  tags: ["soup"],
  equipments: [],
  timings: { preparation: 15 },
  instructions: [{ steps: ["Émincer les oignons."] }],
  ingredients,
});

const resolveFull = (ingredients: SanitizedRecipe["ingredients"]) =>
  resolveRecipeIngredients(ctx, { recipe: recipeOf(ingredients), locale: "fr" });

/** The links alone, for the tests whose subject is what got linked rather than completeness. */
const resolve = async (ingredients: SanitizedRecipe["ingredients"]) =>
  (await resolveFull(ingredients)).links;

/** Distinct nonsense stems, for the tests that must reach a cap without the fold collapsing them. */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** Every name the mocked walk was handed, in call order. */
const walked = (mock: typeof gather) => mock.mock.calls.map((call) => call[1].text as string);

beforeEach(() => {
  gather.mockReset();
  agent.mockReset();
});

describe("functions/recipes/resolveRecipeIngredients", () => {
  test("links a line the catalog already answers, with the LINE's quantity and unit", async () => {
    // `resolveIngredient` also answers `defaultUnit` / `defaultQuantity` — how the food is BOUGHT.
    // A recipe states its own amount, so those two must be read and discarded.
    gather.mockResolvedValue({
      resolved: {
        status: "matched",
        ingredientId: id("onion"),
        name: "Oignon",
        defaultUnit: "kg",
        defaultQuantity: 1,
      },
      evidence: NO_EVIDENCE,
    });

    const links = await resolve([{ name: "oignon", quantity: 200, unit: "g" }]);

    expect(links).toEqual([
      { ingredientId: id("onion"), position: 0, quantity: 200, unit: "g" },
    ]);
    expect(agent).not.toHaveBeenCalled();
  });

  test("resolves a repeated name once, and still links both lines at their own positions", async () => {
    gather.mockResolvedValue({
      resolved: { status: "matched", ingredientId: id("onion"), name: "Oignon", defaultUnit: "pcs", defaultQuantity: 1 },
      evidence: NO_EVIDENCE,
    });

    const links = await resolve([
      { name: "Oignons", quantity: 2, unit: "pcs" },
      { name: "oignon", quantity: 1, unit: "pcs" },
    ]);

    expect(gather).toHaveBeenCalledTimes(1);
    expect(links).toEqual([
      { ingredientId: id("onion"), position: 0, quantity: 2, unit: "pcs" },
      { ingredientId: id("onion"), position: 1, quantity: 1, unit: "pcs" },
    ]);
  });

  /**
   * A grade is identity, not spelling. `searchTerms` drops it because an index never stored the
   * `%`; folding two grades of the same food together here would resolve one and silently link the
   * other to it.
   */
  test("does not fold two grades of the same food into one walk", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    await resolve([
      { name: "steak haché 5%", quantity: 200, unit: "g" },
      { name: "steak haché 20%", quantity: 200, unit: "g" },
    ]);

    expect(gather).toHaveBeenCalledTimes(2);
  });

  /**
   * Same argument as the grade above, one step further out. `searchTerms` reads `séchées` as a
   * preparation and strips it, so without `preservationIn` these two lines are one key: walked
   * once, both linked to whichever row that walk returned, the second line carrying the first's
   * nutrition — and dried tomatoes are roughly ten times as concentrated as fresh ones.
   */
  test("does not fold a dried food into the fresh one it is named after", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    await resolve([
      { name: "tomates", quantity: 400, unit: "g" },
      { name: "tomates séchées", quantity: 50, unit: "g" },
    ]);

    expect(gather).toHaveBeenCalledTimes(2);
  });

  /**
   * The other side of that line, and the reason it is not simply "every qualifier". Freezing and
   * tinning are shelf-life, not identity, and cooking is the cook's own doing — all three are the
   * same shopping decision and must stay ONE walk.
   */
  test("still folds a preparation that does not change what is bought", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    await resolve([
      { name: "petits pois", quantity: 200, unit: "g" },
      { name: "petits pois surgelés", quantity: 200, unit: "g" },
      { name: "boeuf", quantity: 300, unit: "g" },
      { name: "boeuf cuit", quantity: 300, unit: "g" },
    ]);

    expect(gather).toHaveBeenCalledTimes(2);
  });

  /**
   * A known gap, pinned so it is visible rather than surprising. Tinned tomatoes ARE tomatoes by
   * the same argument frozen peas are peas, but `conserve` was never a `QUALIFIER`, so it survives
   * as an identifying word and buys a second walk. Closing it means changing `searchTerms`, which
   * builds the taxonomy keys and the catalog query — a retrieval change, not a fold change. The
   * cost is one redundant walk, not a wrong link, which is why it is recorded and not rushed.
   */
  test("still splits `en conserve`, which is the gap preservationIn does not close", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    await resolve([
      { name: "tomates", quantity: 400, unit: "g" },
      { name: "tomates en conserve", quantity: 400, unit: "g" },
    ]);

    expect(gather).toHaveBeenCalledTimes(2);
  });

  /**
   * The distinction `complete` exists for. A refusal is an ANSWER — the line really is not a food —
   * and an edit should act on it. A walk that threw is not an answer, and an edit that persisted
   * the short list it produces would delete a correct link because an API blipped.
   */
  test("reports complete when every name was answered, refusals included", async () => {
    gather.mockResolvedValue({
      resolved: { status: "refused", reason: "not-food" },
      evidence: NO_EVIDENCE,
    });

    await expect(resolveFull([{ name: "liquide vaisselle", quantity: 1, unit: "ml" }]))
      .resolves.toMatchObject({ links: [], complete: true });
  });

  test("reports incomplete when a walk threw", async () => {
    gather.mockRejectedValue(new Error("Open Food Facts is down"));

    await expect(resolveFull([{ name: "nuoc-mâm", quantity: 1, unit: "tbsp" }]))
      .resolves.toMatchObject({ complete: false });
  });

  test("reports incomplete when a judgement threw", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockRejectedValue(new Error("the model is down"));

    await expect(resolveFull([{ name: "miso", quantity: 30, unit: "g" }]))
      .resolves.toMatchObject({ complete: false });
  });

  test("reports incomplete when a cap dropped a name", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    const lines = Array.from({ length: MAX_WALKS + 1 }, (_, index) => ({
      name: (ALPHABET[index % 26]! + ALPHABET[Math.floor(index / 26)]!).repeat(3),
      quantity: 1,
      unit: "g" as const,
    }));

    await expect(resolveFull(lines)).resolves.toMatchObject({ complete: false });
  });

  test("drops a refused line and leaves every other line alone", async () => {
    gather.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      Promise.resolve(
        text === "liquide vaisselle"
          ? { resolved: { status: "refused", reason: "not-food" }, evidence: NO_EVIDENCE }
          : {
            resolved: { status: "matched", ingredientId: id("onion"), name: "Oignon", defaultUnit: "pcs", defaultQuantity: 1 },
            evidence: NO_EVIDENCE,
          },
      ),
    );

    const links = await resolve([
      { name: "liquide vaisselle", quantity: 1, unit: "ml" },
      { name: "oignon", quantity: 2, unit: "pcs" },
    ]);

    expect(links).toEqual([
      { ingredientId: id("onion"), position: 1, quantity: 2, unit: "pcs" },
    ]);
  });

  /**
   * The failure mode of this file is the status quo, not a lost recipe: before it existed, a name
   * the catalog could not answer produced no link either.
   */
  test("drops a line whose walk threw and leaves every other line alone", async () => {
    gather.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      text === "nuoc-mâm"
        ? Promise.reject(new Error("Open Food Facts is down"))
        : Promise.resolve({
          resolved: { status: "matched", ingredientId: id("onion"), name: "Oignon", defaultUnit: "pcs", defaultQuantity: 1 },
          evidence: NO_EVIDENCE,
        }),
    );

    const links = await resolve([
      { name: "nuoc-mâm", quantity: 1, unit: "tbsp" },
      { name: "oignon", quantity: 2, unit: "pcs" },
    ]);

    expect(links).toEqual([
      { ingredientId: id("onion"), position: 1, quantity: 2, unit: "pcs" },
    ]);
  });

  test("drops a line the model call threw on, and leaves every other line alone", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      text === "poudre de perlimpinpin"
        ? Promise.reject(new Error("the model is down"))
        : Promise.resolve({ status: "created", ingredientId: id("miso"), name: "Miso", source: "agent", defaultUnit: "g", defaultQuantity: 100 }),
    );

    const links = await resolve([
      { name: "poudre de perlimpinpin", quantity: 1, unit: "g" },
      { name: "miso", quantity: 30, unit: "g" },
    ]);

    expect(links).toEqual([{ ingredientId: id("miso"), position: 1, quantity: 30, unit: "g" }]);
  });

  /**
   * The runaway guard. A page that scraped into fifty junk lines must not buy fifty model calls
   * and fifty image generations — past the cap a name is simply left unlinked, which is what an
   * unmatched name always did.
   */
  test("leaves a name past MAX_JUDGEMENTS unlinked rather than inventing it", async () => {
    gather.mockResolvedValue(undecided());
    agent.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      Promise.resolve({ status: "created", ingredientId: id(`row-${text}`), name: text, source: "agent", defaultUnit: "g", defaultQuantity: 100 }),
    );

    // Nonsense words, one per name, because the fold is real here: a numbered suffix folds its
    // digits away and a shared stem folds its plural away, and either would collapse twenty-five
    // names into a handful and never reach the cap.
    const lines = Array.from({ length: MAX_JUDGEMENTS + 5 }, (_, index) => ({
      name: String.fromCharCode(97 + index).repeat(4),
      quantity: 1,
      unit: "g" as const,
    }));

    const links = await resolve(lines);

    expect(gather).toHaveBeenCalledTimes(MAX_JUDGEMENTS + 5);
    expect(agent).toHaveBeenCalledTimes(MAX_JUDGEMENTS);
    expect(links).toHaveLength(MAX_JUDGEMENTS);
  });

  /**
   * The outer cap, and the one that bounds the NETWORK rather than the model: a walk past the
   * catalog reaches two datasets and two live fetches, and `MAX_JUDGEMENTS` cannot bound those
   * because it is applied after they have already run.
   */
  test("leaves a name past MAX_WALKS unwalked, so a scraped page cannot run unbounded", async () => {
    gather.mockResolvedValue(undecided());
    // Refused, so nothing links and the count below is the walk itself rather than its outcome.
    agent.mockResolvedValue({ status: "refused", reason: "not-food" });

    // Two-letter stems, because a numbered suffix folds its digits away and would collapse these
    // onto a handful of keys long before the cap.
    const lines = Array.from({ length: MAX_WALKS + 5 }, (_, index) => ({
      name: (ALPHABET[index % 26]! + ALPHABET[Math.floor(index / 26)]!).repeat(3),
      quantity: 1,
      unit: "g" as const,
    }));

    const links = await resolve(lines);

    expect(gather).toHaveBeenCalledTimes(MAX_WALKS);
    expect(links).toEqual([]);
  });

  /** The whole reason for two passes: nothing reaches the model before every cheap step has run. */
  test("runs every cheap walk before it spends the first model call", async () => {
    const order: string[] = [];

    gather.mockImplementation(async () => {
      order.push("gather");
      return undecided();
    });
    agent.mockImplementation(async () => {
      order.push("agent");
      return { status: "refused", reason: "not-food" };
    });

    await resolve([
      { name: "un", quantity: 1, unit: "g" },
      { name: "deux", quantity: 1, unit: "g" },
      { name: "trois", quantity: 1, unit: "g" },
    ]);

    expect(order).toEqual(["gather", "gather", "gather", "agent", "agent", "agent"]);
  });

  test("indexes every returned link back to its own recipe line", async () => {
    gather.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      Promise.resolve(
        text === "inconnu"
          ? { resolved: { status: "refused", reason: "not-food" }, evidence: NO_EVIDENCE }
          : {
            resolved: { status: "matched", ingredientId: id(text), name: text, defaultUnit: "g", defaultQuantity: 1 },
            evidence: NO_EVIDENCE,
          },
      ),
    );

    const lines = [
      { name: "inconnu", quantity: 1, unit: "g" as const },
      { name: "farine", quantity: 200, unit: "g" as const },
      { name: "beurre", quantity: 50, unit: "g" as const },
    ];

    const links = await resolve(lines);

    for (const link of links) expect(link.ingredientId).toBe(id(lines[link.position]!.name));
    expect(links.map((link) => link.position)).toEqual([1, 2]);
  });

  /**
   * Reuse across an edit was removed deliberately, so this is the behaviour that replaces it:
   * every line is walked, every time. It stays cheap because a line that linked on an earlier save
   * has a catalog row by now, and `gatherEvidence` answers that from its first step — the catalog
   * read — without reaching a dataset, an API or the model.
   */
  test("walks every distinct name, including one an earlier save already linked", async () => {
    gather.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      Promise.resolve({
        resolved: {
          status: "matched",
          ingredientId: id(text),
          name: text,
          defaultUnit: "g",
          defaultQuantity: 1,
        },
        evidence: NO_EVIDENCE,
      }),
    );

    const links = await resolve([
      { name: "oignon", quantity: 2, unit: "pcs" },
      { name: "huile d'olive", quantity: 2, unit: "tbsp" },
    ]);

    expect(walked(gather)).toEqual(["oignon", "huile d'olive"]);
    expect(links.map((link) => link.ingredientId)).toEqual([id("oignon"), id("huile d'olive")]);
  });

  /**
   * `searchTerms` reduces to `[a-z0-9]`, so it empties for a name that was only a quantity. Keyed
   * on `""` these two lines would collapse onto a single walk and both take whatever row it
   * returned; keyed on their raw text they stay two names, and the refusal is the resolver's to
   * make rather than this file's to assume.
   */
  test("keeps two names that fold to nothing apart, and still walks them", async () => {
    gather.mockResolvedValue({
      resolved: { status: "refused", reason: "not-food" },
      evidence: NO_EVIDENCE,
    });

    const links = await resolve([
      { name: "500", quantity: 1, unit: "g" },
      { name: "1 2 3", quantity: 1, unit: "g" },
    ]);

    expect(walked(gather)).toEqual(["500", "1 2 3"]);
    expect(links).toEqual([]);
  });

  /**
   * The reason an empty fold must not skip the line. Every non-Latin script folds away entirely, so
   * a skip would leave `醤油` permanently unlinkable — and, worse, report it as DECIDED, which makes
   * an edit read the missing link as a real absence and wipe the recipe's tags on every save. The
   * catalog cannot retrieve on these, but the datasets, the APIs and the model can.
   */
  test("walks a name written in a script the fold cannot reduce, and reports it decided", async () => {
    gather.mockImplementation((_ctx: unknown, { text }: { text: string }) =>
      Promise.resolve({
        resolved: {
          status: "matched",
          ingredientId: id(text),
          name: text,
          defaultUnit: "ml",
          defaultQuantity: 100,
        },
        evidence: NO_EVIDENCE,
      }),
    );

    const { links, complete } = await resolveFull([
      { name: "醤油", quantity: 15, unit: "ml" },
      { name: "мука", quantity: 200, unit: "g" },
    ]);

    expect(walked(gather)).toEqual(["醤油", "мука"]);
    expect(links.map((link) => link.ingredientId)).toEqual([id("醤油"), id("мука")]);
    expect(complete).toBe(true);
  });
});
