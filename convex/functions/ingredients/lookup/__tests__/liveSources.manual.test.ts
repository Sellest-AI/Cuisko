import { describe, expect, test } from "vitest";

import { CONFIDENT, scoreCandidate } from "@shared/ingredientMatch";

import { searchFoodDataCentral } from "../foodDataCentral";
import { aboutTheSameFood, spellingsOfHit, type LookupHit } from "../lookupHit";
import { searchOpenFoodFacts } from "../openFoodFacts";

/**
 * Step 3 of `resolveIngredient` against the real Open Food Facts and USDA, for the names it would
 * spend on the catalog.
 *
 * Free, but on the network, so it is hand-run and never part of a commit:
 *
 *     pnpm test:manual
 *
 * It needs a real `FDC_API_KEY` in `.env.local`; the runner's placeholder is refused below.
 *
 * **What it checks is the link `_fromApis` makes without asking anyone.** A name a source returns
 * that clears `aboutTheSameFood` is searched in the catalog, and a row it then scores at
 * `CONFIDENT` against is linked on the spot — Jev never sees it. So for each case: every name that
 * clears the gate must score under `CONFIDENT` against the row that is NOT the food.
 *
 * The case that started this: a lasagnes froides recipe asking for `pesto rouge` (tomato) was
 * linked to the seeded `Pesto` (basil) row. An Open Food Facts jar labelled just "Pesto" clears the
 * gate at 0.50 and then matches that row exactly, at 1.0.
 *
 * **A source that answers nothing is a failure here, not a pass.** Open Food Facts answers 503 for
 * hours at a time, and a run in which it said nothing has measured nothing.
 */

type Case = {
  /** What the shopper typed. */
  text: string;
  /** The catalog row that is a different food, which step 3 must not link to on its own. */
  wrongRow: string;
};

const CASES: Case[] = [
  { text: "pesto rouge", wrongRow: "Pesto" },
];

describe("step 3 against the live sources", () => {
  test.each(CASES)("$text never links $wrongRow without asking", async ({ text, wrongRow }) => {
    expect(process.env.FDC_API_KEY, "no real FDC_API_KEY — put one in .env.local").not.toMatch(
      /^test-/,
    );

    const [openFoodFacts, usda] = await Promise.all([
      searchOpenFoodFacts(text),
      searchFoodDataCentral(text),
    ]);

    const sources: [string, LookupHit | undefined][] = [
      ["Open Food Facts", openFoodFacts],
      ["USDA", usda],
    ];

    const rows = sources.flatMap(([source, hit]) =>
      (hit ? spellingsOfHit(hit) : []).map((name) => ({
        source,
        name,
        passesGate: aboutTheSameFood(name, text),
        againstWrongRow: scoreCandidate(name, { id: "", name: wrongRow }),
      })),
    );

    console.log(`\n"${text}" — every name step 3 got back:`);
    for (const { source, name, passesGate, againstWrongRow } of rows)
      console.log(
        `  ${source.padEnd(16)} gate ${passesGate ? "pass" : "drop"}  ` +
        `vs ${wrongRow} ${againstWrongRow.toFixed(2)}${passesGate && againstWrongRow >= CONFIDENT ? "  ← LINKS" : ""}  ${name}`,
      );
    for (const [source, hit] of sources) if (!hit) console.log(`  ${source}: nothing (down, or no result)`);

    expect(openFoodFacts, "Open Food Facts answered nothing — re-run when it is back").toBeDefined();
    expect(usda, "USDA answered nothing — check the key").toBeDefined();

    const links = rows.filter(({ passesGate, againstWrongRow }) =>
      passesGate && againstWrongRow >= CONFIDENT);
    expect(links.map(({ source, name }) => `${source}: ${name}`)).toEqual([]);
  });
});
