import { describe, expect, test } from "vitest";

import type { Doc, Id } from "@convex/_generated/dataModel";

import { soonestExpiries } from "../soonestExpiries";

const DAY = 86_400_000;

const MILK = "milk" as Id<"ingredients">;
const EGGS = "eggs" as Id<"ingredients">;

/** A cellar row with only the fields `soonestExpiries` reads filled in meaningfully. */
const lot = (ingredientId: Id<"ingredients">, quantity: number, expirationDate?: number) =>
  ({
    _id: `${ingredientId}-${quantity}-${expirationDate}` as Id<"cellarItems">,
    _creationTime: 0,
    householdId: "home" as Id<"households">,
    ingredientId,
    unit: "pcs",
    quantity,
    expirationDate,
    updatedAt: 0,
  }) satisfies Doc<"cellarItems">;

describe("soonestExpiries", () => {
  test("keeps the soonest date across an ingredient's lots", () => {
    const expiries = soonestExpiries([lot(MILK, 2, 30 * DAY), lot(MILK, 1, 10 * DAY), lot(EGGS, 6, 21 * DAY)]);

    expect(expiries).toEqual(new Map([[MILK, 10 * DAY], [EGGS, 21 * DAY]]));
  });

  test("skips an undated lot, so it never hides a dated one or counts as urgent", () => {
    expect(soonestExpiries([lot(MILK, 2), lot(MILK, 1, 30 * DAY), lot(EGGS, 6)]))
      .toEqual(new Map([[MILK, 30 * DAY]]));
  });

  test("skips a lot that has run out", () => {
    expect(soonestExpiries([lot(MILK, 0, 1 * DAY), lot(MILK, 2, 30 * DAY)]))
      .toEqual(new Map([[MILK, 30 * DAY]]));
  });

  test("keeps a date already past, since that stock is the most urgent of all", () => {
    expect(soonestExpiries([lot(MILK, 1, -2 * DAY)])).toEqual(new Map([[MILK, -2 * DAY]]));
  });
});
