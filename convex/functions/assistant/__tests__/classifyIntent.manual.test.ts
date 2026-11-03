import { describe, expect, test } from "vitest";

import { isGuess, readIntent } from "@shared/inputIntent";
import type { Locale } from "@shared/translations";

import { CONFIDENCE_FLOOR, judgeIntent, readIntentAnswer } from "../classifyIntent";

/**
 * What the real model does with the inputs `readIntent` cannot settle — and the measurement
 * `CONFIDENCE_FLOOR` is set from.
 *
 * ⚠️ THIS COSTS MONEY — it calls OpenRouter for real, once per fixture. Not much of it: input is
 * $0.042/M and completion is free, so the whole file is a fraction of a cent. It is still a hand-run
 * test, because a live third party has no place in `pnpm verify`:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`); the one the
 * runner injects is a placeholder, and the assertion below says so rather than letting the run fail
 * eighteen times with an auth error that reads like eighteen bad answers.
 *
 * **It calls `judgeIntent`, not `classifyIntent`.** The floor cannot be measured through the code
 * that applies the floor: what is wanted here is the raw confidence, per input.
 *
 * **Every fixture is checked to actually reach the model.** `readIntent` forwards two of its six
 * rules' outcomes — the fall-through and the word count — and a fixture that one of the four written
 * rules answers first measures nothing. The `via` column is which guess forwarded it, and it is
 * asserted rather than printed for decoration: as the trigger and stopword lists grow, a fixture can
 * silently stop arriving here.
 *
 * **A `not_shopping` row asserts the raw choice, not the routed kind.** Below the floor anything
 * routes to `unknown`, so "a car" answered `household_product` at 0.55 would pass on the kind alone.
 * Those rows are reported apart from the two ranges below, because `unknown` is not an answer the
 * floor can be set from.
 *
 * **Read the two summary numbers, not just the pass.** A floor is only defensible if it sits above
 * every wrong answer's confidence and below every right one's. When those ranges overlap, no number
 * separates them and the fix is the criteria in `classifyIntent.ts`.
 */

type Expected = "ingredient" | "recipe" | "chat" | "product" | "not_shopping";

/**
 * Real bar inputs, none of which any of `readIntent`'s four written rules answers.
 *
 * The three groups are the three failures the slice exists for, and the FR/EN split is not
 * decoration: the app's heuristics are per-locale, and a model that reads only English would pass a
 * table of dish names and fail every French cook.
 */
const FIXTURES: readonly (readonly [string, Expected, Locale?])[] = [
  // Dishes nobody has imported yet. Today: invented as an ingredient row, which then outranks the
  // import forever.
  ["boeuf bourguignon", "recipe"],
  ["tarte au citron", "recipe"],
  ["poulet basquaise", "recipe"],
  ["carbonara", "recipe"],
  ["beef wellington", "recipe"],
  ["shepherd's pie", "recipe"],

  // Foods. The one-word ones already reach the resolver correctly; the long ones are read as
  // sentences today and go to the assistant instead of the shopping list.
  ["yuzu", "ingredient"],
  ["kombucha", "ingredient"],
  ["huile olive vierge extra", "ingredient"],
  ["yaourt grec nature sucré", "ingredient"],
  ["graines de chia bio", "ingredient"],
  ["extra virgin olive oil", "ingredient"],

  // Questions with no question mark and no leading trigger word — the shape the fall-through
  // resolves as food today.
  ["calories pomme golden", "chat"],
  ["temps de cuisson des lentilles", "chat"],
  ["remplacer le beurre par de l'huile", "chat"],
  ["pas de viande pour ma bolognaise ce soir", "chat"],
  ["substitute for butter in a cake", "chat"],
  ["vegan dinner ideas for tonight", "chat"],

  // Stock to move, several foods or a verb saying which way: Cuisko asks or acts, the bar cannot.
  ["ajoute 500 g de patates, 3 tomates et 400 g de carottes", "chat"],
  ["retire 500 g de tomates et 2 carottes de mon cellier", "chat"],
  ["retire 2 carottes", "chat"],
  ["add 2 onions and a pack of butter", "chat"],
  ["remove the milk from my cellar", "chat"],

  // A dish with a day, a meal or a head count: Cuisko plans it. The bare dish still opens the recipe.
  // "je veux faire des lasagnes ce soir" is not here: "je veux" is a trigger, so a rule answers it
  // before the model is asked, and a row the model never sees measures nothing.
  ["on mange un curry jeudi midi", "chat"],
  ["lasagnes ce soir pour 4", "chat"],
  ["mets des lasagnes au menu vendredi", "chat"],
  ["lasagna tonight for four", "chat"],
  ["lasagnes", "recipe"],

  // Small things for running the home, which go on the list and never reach the cellar. The locale is
  // stated: `localeOf` reads most bare French words as English, and "dentifrice" would be judged as one.
  // "ampoules LED" and not the bare word, which also means blisters: no criterion can settle that
  // without context, so it is checked on a device instead. "piles" is named in the criterion, because
  // the model does not connect it to batteries on its own, even as "piles AA".
  ["shampoing", "product", "fr"],
  ["dentifrice", "product", "fr"],
  ["3 rouleaux papier toilette", "product", "fr"],
  ["lessive liquide bébé", "product", "fr"],
  ["piles", "product", "fr"],
  ["ampoules LED", "product", "fr"],
  ["poêle", "product", "fr"],
  ["croquettes pour chat", "product", "fr"],
  ["toothpaste", "product", "en"],
  ["2 bin bags", "product", "en"],
  ["cat litter", "product", "en"],
  ["baking paper", "product", "en"],
  ["a wooden spoon", "product", "en"],

  // Everything else that is not food, which must not become a card. The piano and the plane ticket are
  // there because the criterion does not name them: it has to hold past the categories it lists.
  ["fusil", "not_shopping", "fr"],
  ["voiture", "not_shopping", "fr"],
  ["appartement", "not_shopping", "fr"],
  ["chaussettes", "not_shopping", "fr"],
  ["a gun", "not_shopping", "en"],
  ["a car", "not_shopping", "en"],
  // Not "a flat", which is a shoe or a tyre too, and ends on the resolver whichever way it reads.
  ["an apartment", "not_shopping", "en"],
  ["a phone", "not_shopping", "en"],
  ["a piano", "not_shopping", "en"],
  ["a plane ticket", "not_shopping", "en"],
];

/** Crude on purpose: it picks the `locale` field of the state, not a user's setting. */
const localeOf = (input: string) =>
  /[éèêàçù]|\b(de|des|le|la|les|du|au|aux|pour|ma|mon|ce)\b/.test(input) ? "fr" : "en";

/** Which of `readIntent`'s two guesses forwarded this input, or the written rule that stole it. */
const branchOf = (input: string) => {
  // The condition both guesses are reached under: nothing in the catalog, no recipe title match.
  const before = readIntent(input, false, false);

  if (!isGuess(before)) return `RULE ${before.kind}${"reason" in before ? `/${before.reason}` : ""}`;

  return before.kind === "unknown" ? "fall-through" : "word count";
};

const extremes = (values: number[]) =>
  values.length === 0
    ? "none"
    : `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;

describe("judgeIntent against the real model", () => {
  test("routes every input readIntent could only guess at", async () => {
    expect(
      process.env.OPENROUTER_API_KEY,
      "no real OPENROUTER_API_KEY — put one in .env.local",
    ).not.toMatch(/^test-/);

    const rows = await Promise.all(
      FIXTURES.map(async ([input, expected, locale]) => {
        const via = branchOf(input);
        const answer = await judgeIntent({ text: input, locale: locale ?? localeOf(input) });
        const routed = readIntentAnswer(answer);
        const right = expected === "not_shopping" ? answer.choice === "not_shopping" : routed.kind === expected;

        return { input, expected, via, answer, got: routed.kind, right };
      }),
    );

    console.log(
      "\n" +
        rows
          .map(
            (row) =>
              `${row.right ? "✓" : "✗"} ${row.input.padEnd(40)} ` +
              `${row.via.padEnd(13)} want ${row.expected.padEnd(11)} ` +
              `got ${row.got.padEnd(11)} ${row.answer.choice.padEnd(11)} ` +
              `conf ${row.answer.confidence.toFixed(2)}`,
          )
          .join("\n"),
    );

    const measured = rows.filter((row) => row.expected !== "not_shopping");
    const right = measured.filter((row) => row.right);
    const wrong = measured.filter((row) => !row.right);
    const notShopping = rows.filter((row) => row.expected === "not_shopping");
    const missed = notShopping.filter((row) => !row.right);

    console.log(
      `\nconfidence on the ${right.length} right: ${extremes(right.map((r) => r.answer.confidence))}` +
        `\nconfidence on the ${wrong.length} wrong: ${extremes(wrong.map((r) => r.answer.confidence))}` +
        `\nCONFIDENCE_FLOOR is ${CONFIDENCE_FLOOR}. A defensible floor sits between those two ranges.` +
        `\nnot shopping, apart from those: ${notShopping.length - missed.length} of ${notShopping.length} chose it, ` +
        `confidence ${extremes(notShopping.map((r) => r.answer.confidence))}`,
    );

    const stray = rows.filter((row) => row.via.startsWith("RULE"));
    expect(stray.map((row) => `${row.input} — answered by ${row.via}, never reaches the model`)).toEqual([]);

    expect(
      [...wrong, ...missed].map((row) => `${row.input} — wanted ${row.expected}, got ${row.got} (${row.answer.choice})`),
    ).toEqual([]);
  });
});
