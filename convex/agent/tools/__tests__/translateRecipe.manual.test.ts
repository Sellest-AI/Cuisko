/**
 * A bake-off: which model should `translateRecipe` actually run on, and at what reasoning effort?
 *
 * ⚠️ THIS COSTS MONEY AND MINUTES — it calls OpenRouter for real, once per entrant per run plus one
 * judge call. Run it by hand, when you are choosing a model:
 *
 *     pnpm test:manual
 *
 * It needs a real `OPENROUTER_API_KEY` in `.env.local` (gitignored — see `.env.example`), because
 * the one the test runner injects is a placeholder. Nothing automatic runs this file: `pnpm test`,
 * `pnpm test:watch`, `pnpm verify` and the pre-commit hook name their three projects explicitly,
 * and `*.manual.test.ts` belongs to the `manual` project alone.
 *
 * The machinery — blind labelling, the concurrency cap, cost accounting, the judge, the table —
 * lives in `convex/agent/__bench__` and is shared with `sanitizeRecipe`'s bake-off. What is in THIS
 * file is only what is about translation: the source recipe, and how to rank the answers.
 *
 * What is measured is the REAL thing: `translateRecipePrompt`, `translateRecipeUserPrompt`,
 * `modelTranslationsSchema` and `toTranslatedRecipes` are imported from the tool, so a prompt you
 * tune this afternoon is the prompt scored this evening.
 *
 * Translation is the task where the automated half of the judging earns the most, and `CHECKS`
 * below is why this file has the shape it does: a judge reading fifteen answers across two
 * languages will not reliably notice that one of them merged two steps or turned 1,3 kg into
 * 2.9 lb. Code notices every time.
 */
import { describe, expect, it } from "vitest";

import type { Locale } from "@shared/translations";
import { runBakeOff, type Candidate } from "../../__bench__";
import {
  modelTranslationsSchema,
  toTranslatedRecipes,
  translateRecipeUserPrompt,
  type TranslatableRecipe,
  type TranslatedRecipe,
} from "../translateRecipe";
import { translateRecipePrompt } from "../../config/prompts/translateRecipe";

/* ── The field ─────────────────────────────────────────────────────────────────────────── */

/**
 * The models under test and, for each, the reasoning efforts to try it at. Edit this list — it is
 * the knob this file exists for. A model listed with several modes competes once per mode, blind,
 * and the table subtracts the baseline for you.
 *
 * Translation is the cheaper of the two recipe tasks and the one where a small model has the best
 * chance, which is the question worth pointing this at: `sanitizeRecipe`'s winner is probably
 * overkill here, and every recipe pays for this once per language.
 */
const CANDIDATES: Candidate[] = [
  { name: "openai/gpt-6-luna", modes: [false] }, // BEST ONE,
  // { name: "z-ai/glm-5.3-flash", modes: ["low", "medium"] },
  // { name: "deepseek/deepseek-v4-flash-0731", modes: [false] },
  // { name: "deepseek/deepseek-v4.1-flash", modes: [false] },
  // { name: "nvidia/nemotron-3-super-120b-a12b:free", modes: [5000] },
  // { name: "xiaomi/mimo-v2.6-flash", modes: [false] },
  // { name: "z-ai/glm-5.3-flash", modes: ["low"] }, // COSTS TOO MUCH
  // { name: "qwen/qwen3.7-flash", modes: [false] },
];

/* ── The recipe ────────────────────────────────────────────────────────────────────────── */

/**
 * Both supported languages, from a source written in NEITHER of them.
 *
 * Two entries rather than one because the missing-locale failure is the one nothing downstream can
 * recover from, and a bake-off asking for a single language never exercises it: the first `CHECKS`
 * rule below — every requested locale present exactly once — only measures anything from two up.
 * Two is also what puts the decimal separator on both sides of the same run, since 1,3 kg stays
 * 1,3 kg in French and becomes 1.3 kg in English.
 *
 * The SOURCE is Spanish, which is deliberately NOT a supported locale. A French source asked for in
 * French is a copy, and a model scores well on it without translating anything; from Spanish both
 * entries are real work, and neither can be passed by echoing the input.
 */
const LOCALES = ["fr"] as const;

/**
 * A sanitized Spanish recipe, WHOLE: what `sanitizeRecipe` hands over, not what a cook pasted.
 *
 * Whole rather than trimmed to the three fields that come back, because the other fields are what
 * the tool sends as context and the bake-off has to measure the prompt the app actually sends. The
 * ingredient list is the one that earns its tokens here, and it arrives ALREADY translated — one
 * name per language per line, the way the catalog resolves it — so what is being measured is
 * whether the steps use the words they were handed. "cebolleta", "cilantro", "lima" and "pepino"
 * are all named in the steps, and every one of them has a tempting wrong answer a model reaches for
 * on its own: spring onions for a list that says scallion, coriander for one that says cilantro,
 * lemon for citron vert. A model that translates from the Spanish instead of reading the glossary
 * produces exactly those, and the list beside the steps then contradicts them.
 *
 * The list carries NO quantity and NO unit, which is a fixture decision and not a trimmed fixture.
 * When it did, two unrelated models rewrote "3 cda de gochujang" as 4 — the row's quantity is the
 * recipe's TOTAL (3 cs in one step plus 1 cs in another) and reads, beside a list the prompt calls
 * the authority, as the number to use. Gochujang is the only ingredient here split across two
 * steps, which is why it was the only one that broke and why it must stay split.
 *
 * Deliberately loaded with the traps the prompt names, and every one of them is here because it is
 * a real failure mode: metric quantities to be copied rather than converted, a "seis horas" and a
 * "doce horas" written in words, a decimal comma that stays one in French and becomes a point in
 * English, four proper nouns with no equivalent in either target (gochujang, nashi, Kewpie,
 * sriracha), culinary terms a literal gloss ruins ("dorar", "se deshilache", "reservar en frío"),
 * spoon abbreviations that are Spanish words rather than symbols ("cda", "cdta" — which must come
 * out tbsp/tsp and cs/cc, while the g and cl beside them do not move), one group left untitled
 * among two titled ones, and a title whose form in both targets is a dish name rather than a
 * word-by-word rendering.
 */
const SOURCE: TranslatableRecipe = {
  title: "Tacos de cerdo desmechado al gochujang",
  description:
    "Una paleta de cerdo marinada al estilo coreano y cocinada seis horas, servida en tacos con " +
    "encurtido de pepino. Se empieza la víspera y se come con las manos.",
  servings: 4,
  difficulty: 2,
  cuisine: "korean",
  tags: ["main", "spicy", "make-ahead"],
  equipments: ["slow cooker", "oven"],
  timings: { preparation: 30, cooking: 375, resting: 780 },
  ingredients: [
    { names: { en: "pork shoulder", fr: "épaule de porc", es: "paleta de cerdo" } },
    { names: { en: "gochujang", fr: "gochujang", es: "gochujang" } },
    { names: { en: "nashi pear", fr: "poire nashi", es: "pera nashi" } },
    { names: { en: "garlic", fr: "ail", es: "ajo" } },
    { names: { en: "brown sugar", fr: "sucre roux", es: "azúcar moreno" } },
    { names: { en: "soy sauce", fr: "sauce soja", es: "salsa de soja" } },
    { names: { en: "toasted sesame oil", fr: "huile de sésame grillé", es: "aceite de sésamo tostado" } },
    { names: { en: "neutral oil", fr: "huile neutre", es: "aceite neutro" } },
    { names: { en: "bay leaf", fr: "feuille de laurier", es: "hoja de laurel" } },
    { names: { en: "ginger", fr: "gingembre", es: "jengibre" } },
    { names: { en: "cucumber", fr: "concombre", es: "pepino" } },
    { names: { en: "rice vinegar", fr: "vinaigre de riz", es: "vinagre de arroz" } },
    { names: { en: "salt", fr: "sel", es: "sal" } },
    { names: { en: "sugar", fr: "sucre", es: "azúcar" } },
    { names: { en: "japanese mayonnaise", fr: "mayonnaise japonaise", es: "mayonesa japonesa" } },
    { names: { en: "lime", fr: "citron vert", es: "lima" } },
    { names: { en: "sriracha", fr: "sriracha", es: "sriracha" } },
    { names: { en: "corn tortilla", fr: "tortilla de maïs", es: "tortilla de maíz" } },
    { names: { en: "scallion", fr: "oignon nouveau", es: "cebolleta" } },
    { names: { en: "cilantro", fr: "coriandre", es: "cilantro" } },
    { names: { en: "sesame seed", fr: "graine de sésame", es: "semilla de sésamo" } },
  ].map(({ names }) => ({
    names: LOCALES.reduce(
      (acc, locale) => ({ ...acc, [locale]: names[locale] }),
      { es: names.es },
    ),
  })) as TranslatableRecipe["ingredients"],
  instructions: [
    {
      title: "La víspera",
      steps: [{ instruction: "Mezcla 3 cda de gochujang, la pera nashi rallada, 2 dientes de ajo machacados, 2 cdta de azúcar moreno, 4 cda de salsa de soja y 1 cda de aceite de sésamo tostado.", hints: [] }, { instruction: "Masajea la paleta de cerdo de 1,3 kg con la marinada y resérvala en la nevera toda la noche, es decir doce horas.", hints: [] }],
    },
    {
      title: "La cocción",
      steps: [{ instruction: "Saca la carne de la nevera una hora antes de cocinarla, el tiempo que tarde en templarse.", hints: [] }, { instruction: "Dórala bien por todas sus caras en una cazuela con un chorrito de aceite neutro, unos 10 minutos.", hints: ["No llenes demasiado la cazuela: si hace falta, dóralo en dos tandas."] }, { instruction: "Añade 1 hoja de laurel y 10 g de jengibre fresco rallado y deja cocer seis horas a fuego lento, tapada.", hints: [] }, { instruction: "Mientras se hace el cerdo, corta 1 pepino en rodajas finas y déjalas macerar 30 minutos en frío en 25 cl de vinagre de arroz con 5 g de sal y 10 g de azúcar.", hints: ["Con una mandolina las rodajas salen iguales y va el doble de rápido."] }],
    },
    {
      title: null,
      steps: [{ instruction: "Bate 4 cda de mayonesa Kewpie con 1 cda de gochujang, el zumo de 1 lima y 1 cdta de sriracha, y resérvalo en frío.", hints: [] }, { instruction: "Cuando la carne se deshilache con el tenedor, desmenúzala y devuélvela a su jugo de cocción.", hints: ["Si tienes termómetro, está lista a 90 °C en el centro.", "Guarda todo el jugo: es lo que la mantiene tierna."] }, { instruction: "Calienta 12 tortillas de maíz pequeñas 30 segundos por cara en una sartén seca.", hints: [] }, { instruction: "Rellena cada tortilla con carne, encurtido escurrido, salsa, 2 cebolletas picadas, cilantro y semillas de sésamo.", hints: [] }],
    },
  ],
};

/* ── What code can prove wrong ─────────────────────────────────────────────────────────── */

/**
 * Number words, so that "trente minutes" and "30 minutes" can be compared as the same VALUE.
 *
 * One flat map across every language in play rather than one per language: nothing here needs to
 * know which language a word came from, only what it is worth, and "six" being both English and
 * French for 6 is a coincidence worth exploiting rather than modelling.
 *
 * ONE IS DELIBERATELY ABSENT, and it is the entry a reader will miss most. In French and Spanish
 * the word for 1 is also the indefinite article — "un filet d'huile", "una cazuela" — so counting
 * it would score every "a" in the recipe as the number one and the comparison would drown. The
 * cost is that a source "1 lima" rendered "un citron vert" reads here as a number that went
 * missing; it is printed rather than narrated, so it takes one glance to tell from a real drop.
 */
const _NUMBER_WORDS: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, veinte: 20, treinta: 30,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20, thirty: 30,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, vingt: 20, trente: 30,
};

/** Loose on `hints` because `SOURCE` is typed from the model's schema, where a hint list may be absent. */
type _Method = {
  instructions: readonly { steps: readonly { instruction: string; hints?: readonly (string | null | undefined)[] | null }[] }[];
};

const _steps = (recipe: _Method) =>
  recipe.instructions.flatMap((group) => group.steps.map((step) => step.instruction));

/** Each step's hints, in step order — compared step by step, so a hint moved to a neighbour shows. */
const _hints = (recipe: _Method) =>
  recipe.instructions.flatMap((group) => group.steps.map((step) => step.hints ?? []));

/**
 * The units a number can be attached to, in every language this bake-off touches.
 *
 * The list exists to tell a MEASUREMENT from a COUNT, which is the distinction both number checks
 * turn on: "1 cs" is a measurement and dropping it changes the dish, while "1 pepino" is a count
 * and the target language may say it with an article instead of a digit.
 */
const _UNITS = new Set([
  "g", "kg", "mg", "ml", "cl", "l", "oz", "lb", "c",
  "cs", "cc", "tbsp", "tsp", "cda", "cdta",
]);

/**
 * A step's numbers, read once and reported two ways.
 *
 * `values` is what the step is WORTH — digits and number words reduced to the same thing, so
 * "30 minutes" and "trente minutes" compare equal. `digits` is which of those were WRITTEN as
 * digits. The first must never differ between source and translation; the second may, and that
 * difference is a far smaller finding.
 *
 * A BARE 1 — a 1 not attached to a unit — is dropped from BOTH, and this is the subtle part.
 * French and Spanish say a count of one with the same word they use for "a": the prompt itself
 * requires "un citron vert" for "1 lima", because "le jus d'1 citron vert" is a sentence no cook
 * writes. Counting it flagged three runs for obeying that rule while a candidate writing the
 * awkward digit passed — the checker contradicting the specification, which is worse than either
 * being wrong on its own. The cost is the ability to notice a dropped count of one ("1 pepino"
 * becoming "the cucumber"), which loses the cook a number but not the dish. Every 1 that is a
 * MEASUREMENT stays counted, because "1 cs" going missing is a different kind of failure.
 */
const _parse = (text: string) => {
  const digits = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(\S+)?/g)]
    .map((match) => ({
      value: Number(match[1]!.replace(",", ".")),
      unit: (match[2] ?? "").toLowerCase().replace(/[^\p{L}]/gu, ""),
    }))
    .filter(({ value, unit }) => value !== 1 || _UNITS.has(unit))
    .map(({ value }) => value);

  const written = _words(text)
    .trim()
    .split(" ")
    .map((word) => _NUMBER_WORDS[word])
    .filter((value): value is number => value !== undefined);

  const sorted = (values: number[]) => [...values].sort((a, b) => a - b).join(" ");

  return { values: sorted([...digits, ...written]), digits: sorted(digits) };
};

/**
 * The two number faults, told apart, and both PRINTED rather than narrated.
 *
 * Code can prove that two lists of numbers differ. It cannot prove WHY, and the single flag this
 * replaces guessed — "converted, dropped or invented" — which read as an accusation of the worst
 * of the three whichever had happened. Showing both lists costs one line and lets whoever reads
 * the run classify it in a glance: 25 → 250 is a conversion, a missing 1 beside an untouched rest
 * is a dropped count, and identical lists under a form flag is a model spelling a digit out.
 *
 * A value difference is dangerous — the two languages cook differently. A form difference is not:
 * the recipe is correct and merely inconsistent with how the rest of the app writes numbers.
 */
const _numberFaults = (locale: string, steps: string[], sourceSteps: string[]) => {
  const read = steps.map((step, index) => ({
    step: index + 1,
    here: _parse(step),
    source: _parse(sourceSteps[index]!),
  }));

  const value = read.find(({ here, source }) => here.values !== source.values);
  const form = read.find(
    ({ here, source }) => here.values === source.values && here.digits !== source.digits,
  );

  return [
    value !== undefined &&
    `${locale}: step ${value.step} does not state the source's numbers — source ` +
    `[${value.source.values}], translation [${value.here.values}]. A value was converted, ` +
    "dropped or invented.",

    form !== undefined &&
    `${locale}: step ${form.step} keeps every value but changes a number's FORM — the source ` +
    `writes [${form.source.digits || "none"}] as digits where the translation writes ` +
    `[${form.here.digits || "none"}]. Nothing cooks differently; a digit was spelled out or a ` +
    "word was digitised.",
  ];
};

/**
 * Text reduced to space-separated words, padded, so `includes` is a whole-word match.
 *
 * Padding rather than a `\b` regex because half these words are accented and JS `\b` sits between
 * word and non-word characters: `é` is not a word character, so `/\bépaule\b/` never fires and the
 * check would silently pass on every French ingredient it was written for.
 */
const _words = (text: string) =>
  ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/**
 * Ingredient words that leaked in from a language this entry is not written in.
 *
 * Only possible now that the list arrives translated: the entry claims to be English, the glossary
 * says the English word is "scallion" and the French one is "oignon nouveau", so "oignon nouveau"
 * appearing in an English step is not a judgement call — it is the wrong column, quoted. That makes
 * it code's job by the rule at the top of this file, and it takes the sharpest of the judge's
 * criteria off the judge.
 *
 * Only the *other* column is looked for, never the absence of the right one: an ingredient the
 * steps never name is normal, and a model is free to write around one. Ingredients whose two names
 * are the same string — gochujang, sriracha — cannot leak and are skipped.
 */
const _leaks = (locale: (typeof LOCALES)[number], steps: readonly string[]) => {
  const text = _words(steps.join(" "));

  return SOURCE.ingredients.flatMap(({ names }) =>
    LOCALES.filter((other) => other !== locale)
      .filter((other) => names[other] && names[other] !== names[locale])
      .filter((other) => text.includes(_words(names[other]!)))
      .map(
        (other) =>
          `${locale}: a step says "${names[other]}", which is the ${other} name — the ${locale} ` +
          `list says "${names[locale]}"`,
      ),
  );
};

/**
 * Everything wrong with a translation that code can prove, without asking a model.
 *
 * The rule for what belongs here is the harness's: only what is EXACT. "Did it use the right
 * culinary term" is a judge's question and is left to the judge; "does it have the same number of
 * steps" is arithmetic, and a judge asked to do arithmetic across two languages does it badly.
 *
 * Structure and numbers are exactly what this task must preserve, and they are exactly what a
 * fluent, confident, wrong answer breaks invisibly — a merged step reads BETTER in English, and a
 * converted quantity reads more natural to an American cook. Both are failures, and neither looks
 * like one to a reader who is enjoying the prose.
 */
const CHECKS = (translations: TranslatedRecipe<(typeof LOCALES)[number]>[]) => {
  const sourceSteps = _steps(SOURCE);
  const sourceHints = _hints(SOURCE);
  const found = translations.map(({ locale }) => locale);

  const missing = LOCALES.filter(
    (locale) => found.filter((one) => one === locale).length !== 1,
  ).map(
    (locale) =>
      `locale "${locale}" was asked for and came back ` +
      `${found.filter((one) => one === locale).length} time(s)`,
  );

  const perLocale = translations.flatMap(({ locale, recipe }) => {
    const steps = _steps(recipe);
    const sameShape = recipe.instructions.length === SOURCE.instructions.length;
    const sameCount = steps.length === sourceSteps.length;

    return [
      !sameShape &&
      `${locale}: ${recipe.instructions.length} instruction groups, the source has ${SOURCE.instructions.length}`,

      !sameCount && `${locale}: ${steps.length} steps, the source has ${sourceSteps.length}`,

      // A group the source left untitled that came back titled is an invented heading; the reverse
      // is a heading dropped. Only comparable group by group, so only when the counts match.
      sameShape &&
      recipe.instructions.some(
        (group, index) =>
          (group.title === undefined) !== (SOURCE.instructions[index]!.title === null),
      ) &&
      `${locale}: a group gained or lost its title`,

      // Every number the source states survives, and survives in the form it was written in. Two
      // separate findings because they are two separate faults — see `_numberFaults`.
      ...(sameCount ? _numberFaults(locale, steps, sourceSteps) : []),

      // Certain rather than clever: one step identical to the source can be a proper noun standing
      // alone, all of them cannot.
      sameCount &&
      steps.every((step, index) => step === sourceSteps[index]) &&
      `${locale}: not translated at all — every step is the source verbatim`,

      // "The same number of hints on each step, in the same order." Step by step, so a hint that
      // moved to the next step is caught even when the total is right.
      ...(sameCount
        ? _hints(recipe).flatMap((hints, index) =>
          hints.length === sourceHints[index]!.length
            ? []
            : [`${locale}: step ${index + 1} has ${hints.length} hint(s), the source has ${sourceHints[index]!.length}`],
        )
        : []),

      // "each one translated" — a hint copied through in Spanish is a banner the cook cannot read.
      ...(sameCount
        ? _hints(recipe).flatMap((hints, index) =>
          hints
            .filter((hint): hint is string => typeof hint === "string" && sourceHints[index]!.includes(hint))
            .map((hint) => `${locale}: step ${index + 1} kept a hint untranslated: "${hint.slice(0, 40)}…"`),
        )
        : []),

      ..._leaks(locale, steps),
    ].filter((flag): flag is string => typeof flag === "string");
  });

  return [...missing, ...perLocale];
};

/* ── How to rank them ──────────────────────────────────────────────────────────────────── */

/**
 * The domain half of the judging, heaviest first.
 *
 * Keyed to `SOURCE` above on purpose: each one names a decision that recipe actually forces, so a
 * verdict can cite a line rather than grade on impression. Change `SOURCE` and these go stale with
 * it.
 *
 * A FUNCTION of `LOCALES` rather than a constant, because several of these describe a comparison
 * BETWEEN entries — score the weaker one, each column judged against its own — and a single-locale
 * run has no second entry to compare. Left unconditional they ask the judge about a French entry
 * that does not exist, and a judge asked about something absent does not say "absent": it invents
 * an opinion and ranks on it. The per-language examples narrow the same way, so an English-only
 * run is never told what "faites-la revenir" should have been.
 *
 * Structure, numbers and locale coverage are deliberately NOT here — `CHECKS` settles them before
 * the judge reads anything, and its findings reach the judge as facts rather than as questions.
 */
const CRITERIA = ((locales: readonly Locale[]): string[] => {
  const many = locales.length > 1;
  const wants = (locale: Locale) => locales.includes(locale);

  /** The requested languages' renderings of one Spanish phrase, as a list the sentence can take. */
  const each = (renderings: Partial<Record<Locale, string>>) =>
    (Object.keys(renderings) as Locale[])
      .filter(wants)
      .map((locale) => renderings[locale]!)
      .join(" and ");

  return [
    many &&
    "Judge EVERY entry, and score the candidate on its WEAKEST one. An answer that is excellent " +
    "in one language and mediocre in another is a mediocre answer: the app ships them all, and " +
    "the cook only ever reads the one they cannot check.",

    "Is each entry written throughout in the language it claims, in the register a recipe is " +
    "written in for THAT language? Not a Spanish sentence with other words in it: no calque of " +
    "the sentence order, no gerund clause carried across, and one consistent voice from the " +
    "first step to the last" +
    (wants("fr")
      ? " — in French that means \"vous\" in every step, never \"tu\", and never one then the " +
      "other inside a single entry"
      : "") +
    ". This outranks everything below, because those are recipes that read slightly off and this " +
    "one is a recipe a cook can tell was not written for them.",

    "Are the culinary terms the ones a cook uses, rather than the dictionary's? " +
    `"Dórala" is ${each({ en: "brown it or sear it", fr: "faites-la revenir" })}, never ` +
    `"gild it"; "la carne se deshilache" is ` +
    `${each({ en: "the meat shreds or pulls apart", fr: "la viande s'effiloche" })}, never ` +
    `"frays" or "unravels"; "resérvalo en frío" is ` +
    `${each({ en: "chill it", fr: "réservez au frais" })}, never "reserve it in cold"; ` +
    `"el tiempo que tarde en templarse" is ` +
    `${each({ en: "until it comes to room temperature", fr: "le temps qu'elle revienne à température" })}` +
    ", never \"the time it takes to temper itself\"." +
    (wants("en")
      ? " Watch \"cazuela\" in particular: it is a pot or a Dutch oven, and an English entry " +
      "calling it a casserole has been caught by a false friend."
      : "") +
    " A wrong term here is a step that cannot be followed.",

    "Are the spoon abbreviations translated, and only them? " +
    `"cda" and "cdta" are Spanish words — cucharada and cucharadita — and a cook reading ` +
    `${locales.length > 1 ? "another language" : "this one"} cannot read them: they must come ` +
    `out ${each({ en: '"tbsp" and "tsp" in English', fr: '"cs" and "cc" in French' })}. The ` +
    "symbols beside them must NOT move: 10 g stays 10 g, 25 cl stays 25 cl, 1,3 kg keeps its " +
    "value. A candidate that left a raw \"3 cda\" in a step has shipped a step nobody can " +
    "measure; a candidate that turned 25 cl into 250 ml or into cups has changed the recipe. " +
    "Both are failures, and the first is the one that hides best." +
    (wants("fr")
      ? " In French, a 1 counting the ingredient itself is written as the article: \"el zumo de " +
      "1 lima\" is le jus d'un citron vert and \"corta 1 pepino\" is coupez un concombre, never " +
      "\"de 1 citron vert\" or \"d'1 citron vert\". A 1 in front of a measure keeps its digit — " +
      "1 cs, 1 feuille de laurier — and turning that into \"une feuille\" is the opposite fault."
      : "") +
    (wants("en") ? " English keeps the digit everywhere: the juice of 1 lime." : ""),

    "Does every step use the EXACT word the ingredient list gives for that language? The list " +
    "came in already translated and is displayed beside the steps, so this is a lookup the " +
    "candidate either did or did not do. The four to check by name: the list says " +
    `${each({ en: "scallion, cilantro, lime and cucumber in English", fr: "oignon nouveau, coriandre, citron vert and concombre in French" })}` +
    " — a step reaching for a synonym has translated from the Spanish instead of reading the " +
    "glossary it was handed, and the cook is now looking at a step and a list that disagree. The " +
    "same word every time it appears, too: one word in one step and another in the next is the " +
    "same fault twice over." +
    (many
      ? " The languages differing FROM EACH OTHER is correct, not a disagreement — each entry is " +
      "judged against its own column."
      : ""),

    "Is it the same recipe? Nothing added — no note explaining gochujang, no parenthesis giving " +
    "a cup equivalent, no technique spelled out that the Spanish left implicit — and nothing " +
    "dropped, including the small things a translator smooths away: the covered pot, the " +
    "drained pickles, the dry pan.",

    "Are the group titles headings rather than glosses? \"La víspera\" is " +
    `${each({ en: "The day before", fr: "La veille" })} and "La cocción" is ` +
    `${each({ en: "Cooking", fr: "Cuisson" })}` +
    (wants("en") ? ", never \"The cooking\"" : "") +
    (wants("fr") ? ", never \"La cuisson\"" : "") +
    " — an article a language takes in a sentence it drops in a heading where the noun stands " +
    "alone, and keeps where the phrase would stop meaning the same thing without it. The third " +
    "group has no title in the source and must have none.",

    "Are the four names left alone? Gochujang, nashi, Kewpie and sriracha have no word in any " +
    "target language and must appear as they are — not glossed (\"Korean chilli paste\", " +
    "\"pâte de piment coréenne\"), not anglicised, not dropped. \"Nashi pear\" is fine where " +
    "\"Asian pear substitute\" is not.",

    "Does each title read as a dish name a cook in that language would say, rather than as a " +
    "translation of the Spanish words? It still names only what the dish holds — no serving " +
    "count, no \"Recipe for\", no \"Recette de\".",

    "Does each description still do its job in two sentences — what it tastes like and when you " +
    "would make it — rather than becoming a literal rendering that manages neither?",

    "Do the hints read as a cook's aside in the target language — short, spoken, the advice " +
    "intact (two batches, the mandoline, 90 °C at the core, keep the juice) — rather than a stiff " +
    "gloss? A hint merged into its step's text, or a hint the translator added, is a fault: the " +
    "source's four hints are the only ones there are.",
  ].filter((criterion): criterion is string => typeof criterion === "string");
})(LOCALES);

/* ── The run ───────────────────────────────────────────────────────────────────────────── */

describe("translateRecipe — model bake-off", () => {
  it("ranks the field", async () => {
    const result = await runBakeOff({
      title: "translateRecipe",
      candidates: CANDIDATES,
      system: translateRecipePrompt(LOCALES),
      prompt: translateRecipeUserPrompt(SOURCE),
      // Through the real parser, because "did it produce something the app can store" is half of
      // what is being measured — and here the parser is also what enforces that the language it
      // answered in is one that was actually asked for.
      answer: {
        schema: modelTranslationsSchema(LOCALES),
        parse: (raw) => toTranslatedRecipes(raw, LOCALES),
        check: CHECKS,
      },
      provider: { ignore: ["open-inference", "morph", "digitalocean", "baidu"], sort: "price" },
      criteria: CRITERIA,
      runs: 3,
    });

    // The only assertion, and it guards the benchmark rather than the models: an empty table is a
    // broken key or a dead slug, not a result. `clean` is deliberately NOT asserted on — a field
    // where every run is flagged is a finding to read, not a red test.
    expect(result.ok).toBeGreaterThan(0);
  });
});
