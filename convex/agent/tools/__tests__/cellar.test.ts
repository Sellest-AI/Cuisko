import type { Id } from "@convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

import { addToCellarTool, removeFromCellarTool, toCellarItems } from "../cellar";

const HOME = "home" as Id<"households">;
const CAMILLE = "camille" as Id<"users">;

type Tool = ReturnType<typeof addToCellarTool>;
type Ctx = Parameters<Tool["run"]>[0];

/**
 * A ctx whose id check answers `missing`, and whose mutation answers each line from `answer` — or
 * throws what it returns when that is an Error, which is how one line fails and not the others.
 */
const _ctx = (answer: (args: { ingredientId: string; unit: string; quantity: number }) => unknown, missing: string[] = []) => {
  const runQuery = vi.fn(async () => missing);
  const runMutation = vi.fn(async (_ref: unknown, args: { ingredientId: string; unit: string; quantity: number }) => {
    const answered = answer(args);
    if (answered instanceof Error) throw answered;
    return answered;
  });

  return { ctx: { runQuery, runMutation } as unknown as Ctx, runMutation };
};

describe("toCellarItems", () => {
  it("throws on an id the catalog does not hold, naming it", () => {
    expect(() => toCellarItems([{ ingredientId: "licorne", quantity: 1, unit: "pcs" }], ["licorne"])).toThrow(/licorne/);
  });

  /** "2 tomates… et encore 1 tomate" is three tomatoes, not two writes to one row. */
  it("sums the same ingredient in the same unit, and keeps another unit apart", () => {
    const items = toCellarItems([
      { ingredientId: "tomato", quantity: 2, unit: "pcs" },
      { ingredientId: "flour", quantity: 500, unit: "g" },
      { ingredientId: "tomato", quantity: 1, unit: "pcs" },
      { ingredientId: "tomato", quantity: 200, unit: "g" },
    ], []);

    expect(items).toEqual([
      { ingredientId: "tomato", quantity: 3, unit: "pcs" },
      { ingredientId: "flour", quantity: 500, unit: "g" },
      { ingredientId: "tomato", quantity: 200, unit: "g" },
    ]);
  });
});

describe("addToCellarTool", () => {
  it("returns each line with the row it landed on and what it struck off the list", async () => {
    const { ctx } = _ctx(({ ingredientId }) => ({ cellarItemId: `row-${ingredientId}`, struck: ingredientId === "potato" ? 200 : 0 }));

    const change = await addToCellarTool({ householdId: HOME, userId: CAMILLE }).run(ctx, {
      items: [{ ingredientId: "potato", quantity: 500, unit: "g" }, { ingredientId: "tomato", quantity: 3, unit: "pcs" }],
    });

    expect(change).toEqual({
      v: 1,
      action: "add",
      householdId: HOME,
      lines: [
        { ingredientId: "potato", cellarItemId: "row-potato", unit: "g", quantity: 500, restoreToList: 200 },
        { ingredientId: "tomato", cellarItemId: "row-tomato", unit: "pcs", quantity: 3, restoreToList: 0 },
      ],
      absent: [],
      failed: [],
    });
  });

  /** An invented id is a bug in the call, and nothing has moved yet: the model retries with real ones. */
  it("throws on an unknown id before writing anything", async () => {
    const { ctx, runMutation } = _ctx(() => ({ cellarItemId: "row", struck: 0 }), ["licorne"]);

    await expect(
      addToCellarTool({ householdId: HOME, userId: CAMILLE }).run(ctx, { items: [{ ingredientId: "licorne", quantity: 1, unit: "pcs" }] }),
    ).rejects.toThrow(/licorne/);
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("removeFromCellarTool", () => {
  /** The lines are the undo's receipt: what really moved, in the unit of the row it moved from. */
  it("returns what was really removed, in the row's unit", async () => {
    const { ctx } = _ctx(() => ({ cellarItemId: "row-flour", unit: "g", removed: 1000 }));

    const change = await removeFromCellarTool({ householdId: HOME }).run(ctx, {
      items: [{ ingredientId: "flour", quantity: 1, unit: "kg" }],
    });

    expect(change.lines).toEqual([{ ingredientId: "flour", cellarItemId: "row-flour", unit: "g", quantity: 1000 }]);
  });

  /**
   * Each line is its own mutation, so a failure cannot take back the lines before it. The card and
   * its undo must cover exactly what landed, and the model must hear what did not.
   */
  it("keeps the lines that landed and reports the one that failed, in the server's words", async () => {
    const { ctx } = _ctx(({ ingredientId }) =>
      ingredientId === "tomato"
        ? new ConvexError({ code: "INVALID_INPUT", message: "No cellar row in g or a unit convertible to it. The cellar holds: 4 pcs." })
        : { cellarItemId: `row-${ingredientId}`, unit: "pcs", removed: 2 });

    const change = await removeFromCellarTool({ householdId: HOME }).run(ctx, {
      items: [
        { ingredientId: "carrot", quantity: 2, unit: "pcs" },
        { ingredientId: "tomato", quantity: 500, unit: "g" },
        { ingredientId: "onion", quantity: 2, unit: "pcs" },
      ],
    });

    expect(change.lines.map((line) => line.ingredientId)).toEqual(["carrot", "onion"]);
    expect(change.failed).toEqual([
      { ingredientId: "tomato", reason: "No cellar row in g or a unit convertible to it. The cellar holds: 4 pcs." },
    ]);
  });

  /**
   * The cellar is often behind the kitchen: "j'ai utilisé 2 carottes" when it holds none is nothing
   * to take, not a failure the model should apologise for.
   */
  it("reports food the cellar held none of as absent, not failed", async () => {
    const { ctx } = _ctx(({ ingredientId }) =>
      ingredientId === "carrot"
        ? new ConvexError({ code: "NOT_FOUND", message: "No cellar row to remove." })
        : { cellarItemId: `row-${ingredientId}`, unit: "g", removed: 500 });

    const change = await removeFromCellarTool({ householdId: HOME }).run(ctx, {
      items: [{ ingredientId: "carrot", quantity: 2, unit: "pcs" }, { ingredientId: "pasta", quantity: 500, unit: "g" }],
    });

    expect(change.absent).toEqual(["carrot"]);
    expect(change.failed).toEqual([]);
    expect(change.lines.map((line) => line.ingredientId)).toEqual(["pasta"]);
  });

  /**
   * A row can sit at 0. What took nothing is not a line: the chat drops a change holding a line at
   * 0 whole, so it would take the card, and the undo, of every line that really moved with it.
   */
  it("reports a row that held nothing as absent, not as a line at 0", async () => {
    const { ctx } = _ctx(({ ingredientId }) =>
      ({ cellarItemId: `row-${ingredientId}`, unit: "pcs", removed: ingredientId === "tomato" ? 0 : 2 }));

    const change = await removeFromCellarTool({ householdId: HOME }).run(ctx, {
      items: [{ ingredientId: "tomato", quantity: 2, unit: "pcs" }, { ingredientId: "carrot", quantity: 2, unit: "pcs" }],
    });

    expect(change.absent).toEqual(["tomato"]);
    expect(change.lines.every((line) => line.quantity > 0)).toBe(true);
    expect(change.lines.map((line) => line.ingredientId)).toEqual(["carrot"]);
  });
});
