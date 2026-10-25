import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { CANDIDATES, ranking, type Scored } from "@convex/lib/typesafe/__tests__/candidates.fixtures";
import { retryPromise } from "@shared/helpers";
import type { Locale } from "@shared/translations";

import {
  ALIAS_WORTH_SAVING,
  judgeAlias,
  judgeMatch,
  MATCHED,
  NONE,
  optionsFor,
  readMatchAnswer,
  type Dictionary,
} from "../matchIngredient";

/**
 * What Jev does with the near-misses `resolveWithAgent` hands it, and the measurement `MATCHED`
 * and `ALIAS_WORTH_SAVING` are set from.
 *
 * ⚠️ THIS COSTS MONEY — a fraction of a cent per model: one TypeSafe call per fixture, plus one per
 * fixture with an alias verdict, for every model in `CANDIDATES` (`lib/typesafe/__tests__/`), which
 * it ranks side by side. It calls OpenRouter for real, so it is hand-run:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local`; the runner's placeholder is refused below.
 *
 * **It replaces the ranker's chat-model bake-off, whose fixtures it keeps.** That harness judged a
 * generated answer with a second model; Jev generates nothing, so what is left to read is the
 * probability it put on each option, and code compares an option name better than a judge does.
 *
 * **The failure modes are opposite, so every fixture matters.** A MISSED match creates a duplicate
 * row that splits every list and total from then on; a WRONG match puts a different food on a
 * shopping list. A model that always answers none is perfect on the refusals and useless on the
 * matches, so read the table, not the pass count.
 *
 * **Read the summary ranges.** A floor is defensible only above every wrong pick's probability and
 * below every right link's. When they overlap, the fix is the question in `matchIngredient.ts`, not
 * the number.
 */

type Fixture = {
  title: string;
  text: string;
  locale: Locale;
  candidates: string[];
  dictionary?: Dictionary;
  /** The candidate that is the food, or undefined when none is. */
  want?: string;
  /** Whether the typed word should be stored on `want`. Undefined = not measured here. */
  keeps?: boolean;
};

const FIXTURES: Fixture[] = [
  // The match is there and it is not the closest spelling. `oignon nouveau` is the trap: "spring
  // onion / scallion" is the synonym example the old prompt gave, and a shallot is not one.
  {
    title: "present",
    text: "échalote",
    locale: "fr",
    candidates: ["oignon rouge", "oignon nouveau", "ail", "shallot", "ciboulette"],
    want: "shallot",
    keeps: true,
  },
  // The same match through a keyboard slip: the link is wanted, the word is not.
  {
    title: "mangled",
    text: "échqlote",
    locale: "fr",
    candidates: ["oignon rouge", "oignon nouveau", "ail", "shallot", "ciboulette"],
    want: "shallot",
    keeps: false,
  },
  // A real fruit the catalog lacks, against rows that only share letters.
  { title: "absent", text: "kaki", locale: "fr", candidates: ["kiwi", "kale", "cacao", "saké"] },
  // Every candidate IS the almond and none is the product.
  {
    title: "wrong form",
    text: "amande",
    locale: "fr",
    candidates: ["poudre d'amande", "lait d'amande", "huile d'amande", "noisette", "amandes effilées"],
  },
  // `pain blanc` is the shelf a pain de mie sits on, not the item.
  {
    title: "too specific",
    text: "pain de mie",
    locale: "fr",
    candidates: ["pain blanc", "pain complet", "baguette", "biscotte", "farine de blé"],
  },
  // The number is the whole identity; an ungraded row is a fifth product, not a wildcard.
  {
    title: "wrong grade",
    text: "steak haché 5%",
    locale: "fr",
    candidates: ["bœuf haché 20%", "steak haché", "steak de bœuf", "saucisse de bœuf", "haché de veau"],
  },
  // A dictionary has already said lemon juice; `Citron` is the right fruit and the wrong purchase.
  {
    title: "wrong fruit",
    text: "jus de citron",
    locale: "fr",
    candidates: ["Jus d'orange", "Citron", "Citron vert", "Jus de pomme", "Vinaigre blanc"],
    dictionary: { en: ["lemon juice"], fr: ["jus de citron"] },
  },
  // Strike the maker and the catalog holds what is left, verbatim.
  {
    title: "brand",
    text: "ketchup heinz",
    locale: "fr",
    candidates: ["sauce tomate", "ketchup", "sauce barbecue", "moutarde", "concentré de tomates"],
    want: "ketchup",
    keeps: true,
  },
  // A second brand, so the alias floor is not set from one: a shortened question stored ketchup
  // heinz and dropped this one at 0.70.
  {
    title: "brand 2",
    text: "moutarde amora",
    locale: "fr",
    candidates: ["Moutarde", "mayonnaise", "Ketchup", "vinaigre blanc"],
    want: "Moutarde",
    keeps: true,
  },
  // The right row, reached through more than its name: the link is wanted, the phrase is not.
  {
    title: "quantity",
    text: "2 carottes",
    locale: "fr",
    candidates: ["carotte", "carottes râpées", "panais"],
    want: "carotte",
    keeps: false,
  },
  // Strike the maker and what is left names a shelf the list splits into kinds.
  {
    title: "brand variety",
    text: "chocolat lindt",
    locale: "fr",
    candidates: ["chocolat au lait", "chocolat noir 70%", "chocolat blanc", "cacao en poudre", "pâte à tartiner"],
  },
  // The link that started this: a bbcgoodfood tacos recipe, cider vinegar linked to balsamic.
  {
    title: "cider vinegar",
    text: "cider vinegar",
    locale: "en",
    candidates: ["white vinegar", "balsamic vinegar", "rice vinegar"],
    dictionary: { en: ["cider vinegar"], fr: ["vinaigre de cidre"] },
  },
  // The same term against the drink the vinegar is made from.
  {
    title: "cider drink",
    text: "cider vinegar",
    locale: "en",
    candidates: ["white vinegar", "balsamic vinegar", "cider"],
    dictionary: { en: ["cider vinegar"], fr: ["vinaigre de cidre"] },
  },
  // The positive control for the two above: the row exists, among the traps.
  {
    title: "cider present",
    text: "vinaigre de cidre",
    locale: "fr",
    candidates: ["white vinegar", "balsamic vinegar", "cider", "cider vinegar"],
    dictionary: { en: ["cider vinegar"], fr: ["vinaigre de cidre"] },
    want: "cider vinegar",
    keeps: true,
  },
  // A lasagnes froides recipe: red pesto saved linked to the seeded green Pesto. Not a kind of
  // pesto but another product, made from tomato rather than basil. The candidates are the five the
  // dev catalog search returned for it, Pesto first at 0.50.
  {
    title: "another product",
    text: "pesto rouge",
    locale: "fr",
    candidates: ["Pesto", "piment rouge", "Poivron rouge", "Pâte de curry rouge", "Oignon rouge"],
  },
  // The positive control for the one above: the other product exists, beside pesto.
  {
    title: "another product present",
    text: "pesto rouge",
    locale: "fr",
    candidates: ["Pesto", "Pesto rouge", "piment rouge", "Poivron rouge", "Pâte de curry rouge"],
    want: "Pesto rouge",
  },
  // Held out: the same rule on foods the question never names, so a pass is the rule and not the
  // word. Keep both OUT of `_MATCH_INSTRUCTIONS`, as `moutarde amora` is kept out of the alias one.
  {
    title: "another product, held out",
    text: "lait de coco",
    locale: "fr",
    candidates: ["Lait", "Noix de coco", "Crème de coco", "Lait d'amande"],
  },
  {
    title: "another product, held out 2",
    text: "beurre de cacahuète",
    locale: "fr",
    candidates: ["Beurre", "Cacahuète", "Beurre doux", "Pâte à tartiner"],
  },
];

/** The wrong candidate that drew the most probability, as `name 0.12`. */
const _worstWrong = (probabilities: Record<string, number>, want?: string) => {
  const [option, probability] = Object.entries(probabilities)
    .filter(([key]) => key !== NONE && key !== want)
    .sort(([, a], [, b]) => b - a)[0] ?? ["-", 0];

  return `${option} ${probability.toFixed(2)}`;
};

const extremes = (values: number[]) =>
  values.length === 0
    ? "none"
    : `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;

const runOf = (model: string) =>
  Promise.all(
    FIXTURES.map(async (fixture) => {
      const candidates = fixture.candidates.map((name, index) => ({ id: `k${index}`, name }));
      const input = { ...fixture, candidates, model };

      // Retried as production retries: every model runs at once, and a free tier's 429 is not a wrong answer.
      const answer = await retryPromise(() => judgeMatch(input), 2);
      const linked = readMatchAnswer(answer, candidates)?.name;
      const probability = answer.probabilities[answer.choice] ?? 0;

      // Asked of the RIGHT row whatever the match said, so a fixture measures the word alone.
      const alias = fixture.want && fixture.keeps !== undefined
        ? (await retryPromise(() => judgeAlias(input, fixture.want!), 2)).noul
        : undefined;

      return { fixture, answer, probability, linked, alias };
    }),
  );
type Row = Awaited<ReturnType<typeof runOf>>[number];

const isRight = ({ fixture, linked, alias }: Row) =>
  linked === fixture.want &&
  (alias === undefined || (alias >= ALIAS_WORTH_SAVING) === fixture.keeps);

/** Filled by each model's test as it lands, ranked once they all have. */
const scores: Scored[] = [];

describe("matchIngredient against the real models", () => {
  beforeAll(() => {
    expect(
      process.env.OPENROUTER_API_KEY,
      "no real OPENROUTER_API_KEY — put one in .env.local",
    ).not.toMatch(/^test-/);
  });

  afterAll(() => {
    console.log(`\nmatchIngredient, ${FIXTURES.length} fixtures, by fixtures right then gap:\n${ranking(scores)}`);
  });

  // Sanity on the fixtures themselves: an option key the model never saw is a typo here.
  test("every fixture wants one of its own candidates", () => {
    for (const fixture of FIXTURES)
      if (fixture.want) expect(optionsFor(fixture.candidates.map((name) => ({ id: name, name })))).toContain(fixture.want);
  });

  // One test per model, so the run says which models pass and the ranking says by how much.
  test.concurrent.each(CANDIDATES)("%s links only the same food, and stores only a word", async (model) => {
    let rows: Row[];
    try {
      rows = await runOf(model);
    } catch (error) {
      const failed = error instanceof Error ? error.message : String(error);
      scores.push({ model, failed, right: 0, total: FIXTURES.length, rightLinks: [], wrong: [], misses: [] });
      throw error;
    }

    scores.push({
      model,
      right: rows.filter(isRight).length,
      total: FIXTURES.length,
      rightLinks: rows.filter((r) => r.fixture.want && r.answer.choice === r.fixture.want).map((r) => r.probability),
      wrong: rows.map((r) =>
        Math.max(
          0,
          ...Object.entries(r.answer.probabilities)
            .filter(([option]) => option !== NONE && option !== r.fixture.want)
            .map(([, probability]) => probability),
        ),
      ),
      misses: rows.filter((r) => !isRight(r)).map((r) => `${r.fixture.text} → ${r.linked ?? NONE}`),
    });

    console.log(
      `\n${model}:\n` +
      rows
        .map(({ fixture, answer, probability, linked, alias }) => {
          const right = linked === fixture.want;
          const aliasRight = alias === undefined || (alias >= ALIAS_WORTH_SAVING) === fixture.keeps;

          return (
            `${right && aliasRight ? "✓" : "✗"} ${fixture.title.padEnd(14)} ` +
            `want ${(fixture.want ?? NONE).padEnd(16)} ` +
            `pick ${answer.choice.padEnd(18)} p ${probability.toFixed(2)} ` +
            `→ ${(linked ?? NONE).padEnd(16)} ` +
            `worst ${_worstWrong(answer.probabilities, fixture.want)}` +
            (alias === undefined ? "" : ` alias ${alias.toFixed(2)} (want ${fixture.keeps})`)
          );
        })
        .join("\n"),
    );

    // The margin is the most probability ANY wrong candidate drew, picked or not: a model that never
    // picks wrong can still put 0.7 on the balsamic, and that is one prompt change from a link.
    const rightLinks = rows.filter((r) => r.fixture.want && r.answer.choice === r.fixture.want);
    const bestWrong = rows.map((r) =>
      Math.max(
        0,
        ...Object.entries(r.answer.probabilities)
          .filter(([option]) => option !== NONE && option !== r.fixture.want)
          .map(([, probability]) => probability),
      ),
    );
    const keep = rows.filter((r) => r.fixture.keeps === true && r.alias !== undefined);
    const drop = rows.filter((r) => r.fixture.keeps === false && r.alias !== undefined);

    console.log(
      `\npick probability on the ${rightLinks.length} right: ${extremes(rightLinks.map((r) => r.probability))}` +
      `\nmost any wrong candidate drew, per fixture: ${extremes(bestWrong)}` +
      `\nMATCHED is ${MATCHED}. A defensible floor sits between those two ranges.` +
      `\nalias yes on the ${keep.length} words: ${extremes(keep.map((r) => r.alias ?? 0))}` +
      `\nalias yes on the ${drop.length} slips: ${extremes(drop.map((r) => r.alias ?? 0))}` +
      `\nALIAS_WORTH_SAVING is ${ALIAS_WORTH_SAVING}.`,
    );

    expect(rows.filter((r) => r.linked !== r.fixture.want).map((r) => r.fixture.title)).toEqual([]);
    expect(
      rows
        .filter((r) => r.alias !== undefined && (r.alias >= ALIAS_WORTH_SAVING) !== r.fixture.keeps)
        .map((r) => r.fixture.title),
    ).toEqual([]);
  });
});
