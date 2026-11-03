import { askTypeSafe, type ChoiceAnswer, type ChoiceQuestion, type ReportUsage } from "@convex/lib/typesafe/ask";
import type { Intent } from "@shared/inputIntent";
import type { Locale } from "@shared/translations";

/**
 * What the shopper meant, for the two inputs `readIntent` can only guess at.
 *
 * `readIntent` decides Enter from six rules. Four of them read something the shopper wrote on
 * purpose — a question mark, a leading trigger word, a catalog hit, a recipe title hit — and those
 * are never sent here. **The model resolves a guess; it never overrides a written rule.** Reverse
 * that and "? tomate" becomes a tomato again, which is the exact failure `readIntent`'s rule order
 * exists to prevent.
 *
 * The two it does answer:
 *
 *   - **rule 6, the fall-through.** Everything the catalog and the recipe titles could not explain
 *     goes to the ingredient resolver today, so a dish nobody has imported is invented as an
 *     ingredient under its own name — and once that row exists, gate 1 of `useBarSuggestions`
 *     covers the whole input forever and the later import can never win it back.
 *   - **rule 5, the word count.** Four content words reads as a sentence, so "huile olive vierge
 *     extra" is sent to the assistant instead of the shopping list.
 *
 * Both branches are reached only BELOW rules 3 and 4, which is what lets the state below claim
 * honestly that the catalog and the titles were asked and came back empty.
 */

/**
 * What the input can be, as the model is asked about it.
 *
 * `request` rather than `chat`: the option names are read by the model and nothing else, so they say
 * what the input *is* rather than which screen it opens. `readIntentAnswer` maps them to the kinds
 * the bar routes on.
 *
 * `not_shopping` IS the no-match outcome, rather than a probability under some floor: nothing has to
 * be forced into a food or a household shape, and `household_product` is otherwise the nearest thing
 * to a car.
 *
 * A type and not a const array: `QUESTION.criteria` is where the options exist at runtime, and the
 * transport reads the option set off its keys. A second list would be one that could disagree.
 */
type Option = "ingredient" | "recipe" | "household_product" | "request" | "not_shopping";

/**
 * How concentrated the distribution has to be before we act on the pick.
 *
 * Below it the answer is discarded and `{ kind: "unknown" }` goes back, which the caller reads as
 * "no opinion, keep what you decided" — so an unconfident judgment costs a call and changes
 * nothing. A number picked by feel would be a number nothing could defend, so this one is measured:
 * `__tests__/classifyIntent.manual.test.ts` runs the real model over 51 real bar inputs and prints
 * the two ranges a floor has to sit between.
 *
 * **Measured 2026-11-03, with household products: right answers 0.71–1.00, no wrong answers.** The
 * lowest are "croquettes pour chat" at 0.71 and the bare keywords "calories pomme golden" at 0.76.
 * The 10 not-shopping rows all chose it, at 0.56–1.00, and are reported apart because their outcome
 * is the same on either side of the floor: "fusil" at 0.56 is no opinion both ways. Bare "ampoules"
 * is not a row, since it also means blisters and no criterion can settle that without context.
 * Re-run the file when the criteria change.
 */
export const CONFIDENCE_FLOOR = 0.6;

const QUESTION: ChoiceQuestion<Option> = {
  type: "choice",
  instructions:
    "A shopper typed this into the search bar of a cooking app that plans meals from the food " +
    "they already own. What is it?",
  criteria: {
    ingredient:
      "A single food or drink, possibly with a quantity or a brand — something a person eats or " +
      "drinks. Includes foods written as several words (\"extra virgin olive oil\", \"plain greek " +
      "yoghurt\") and foods nobody has heard of. It has to be edible: being typed into a cooking " +
      "app does not make a word a food.",
    recipe:
      "The name of a dish or a prepared meal — something you cook from several ingredients, not " +
      "something you buy as one item. \"beef bourguignon\", \"carbonara\", \"lemon tart\".",
    household_product:
      "A single small item for running the home that nobody in the household eats or drinks, " +
      "possibly with a quantity or a brand, consumable or not, in whichever language the input is " +
      "written. It has to fall in one of these categories: hygiene and toiletries, cleaning and " +
      "laundry, paper goods, kitchen supplies and utensils, light bulbs and batteries/piles, baby care, " +
      "pet care, including anything made for a pet to eat. Food for a baby is food, not this. " +
      "Outside these categories, being for sale is not enough.",
    request:
      "Anything addressed to an assistant: a question, an instruction, a problem to solve, or a " +
      "request for ideas. It may well mention foods or dishes — what makes it this option is that " +
      "the shopper is asking for something rather than naming something. It need not be a full " +
      "sentence: a fact looked up ABOUT a food, written as bare keywords, is a request and not the " +
      "food — its calories, its cooking time, how to store it, what to replace it with. An " +
      "instruction to add or remove food is a request too, and so is a list of several foods: " +
      "\"retire 2 carottes\", \"add milk and eggs\", \"500 g de patates, 3 tomates\". So is a dish " +
      "said with when it will be cooked or eaten, or for how many: the shopper wants it planned, " +
      "not looked up. \"je veux faire des lasagnes ce soir\", \"curry jeudi midi\", \"lasagna " +
      "tonight for four\".",
    not_shopping:
      "A thing that is neither food nor one of the household categories above, and not a request: " +
      "clothing, phones and electronics, weapons, vehicles, homes, furniture, or anything else that " +
      "is not picked up along with the groceries.",
  },
};

/** The key the answer comes back under. Ours only: the model never sees it. */
const KEY = "intent";

/**
 * One answer → the intent the bar routes on, or no opinion.
 *
 * Pure and exported so the mapping and the floor are pinned by a unit test rather than by a live
 * call: what the model says is its business, but what we DO with a 0.58 is ours.
 *
 * `not_shopping` is no opinion rather than a kind of its own, so the word falls back to the local
 * answer. The resolver refuses it, or the assistant takes it when it runs to four content words.
 */
export const readIntentAnswer = (answer: ChoiceAnswer<Option>): Intent => {
  if (answer.confidence < CONFIDENCE_FLOOR) return { kind: "unknown" };

  switch (answer.choice) {
    case "ingredient":
      return { kind: "ingredient" };
    case "recipe":
      return { kind: "recipe" };
    case "household_product":
      return { kind: "product" };
    case "request":
      return { kind: "chat", reason: "model" };
    case "not_shopping":
      return { kind: "unknown" };
  }
};

type Input = {
  text: string;
  locale: Locale;
  /** Handed what the call used, for the caller to record against its trace. The bake-off passes none. */
  report?: ReportUsage;
};

/**
 * The raw judgment, confidence and all. **Throws** on anything the transport cannot parse.
 *
 * Split from `classifyIntent` rather than inlined, because the two answer different questions and
 * only one of them is ours: this one is what the model said, and `readIntentAnswer` is what we do
 * about it. `__tests__/classifyIntent.manual.test.ts` needs the first — a floor cannot be set from
 * an answer that has already had the floor applied to it.
 */
export const judgeIntent = async ({ text, locale, report }: Input): Promise<ChoiceAnswer<Option>> => {
  /**
   * Structured rather than the bare string, because what we already tried is evidence.
   *
   * The two "no match" lines are the reason the model can prefer `recipe` or `request` for a
   * food-looking phrase: it is being told that the 200-row catalog and every recipe title were
   * already asked. Without them it is guessing at a word in isolation, which is what the word count
   * it replaces was doing.
   */
  const state = {
    input: text,
    locale,
    ingredientCatalog: "searched, no match",
    recipeTitles: "searched, no match",
  };

  const answers = await askTypeSafe(state, { [KEY]: QUESTION }, report);

  return answers[KEY];
};

/**
 * Free text one of `readIntent`'s guesses could not settle → what to do with it.
 *
 * No `ctx`: this reads nothing and writes nothing. It is one outbound call and a mapping, which is
 * also why it is testable without a Convex harness.
 *
 * **It does not throw.** Every failure — a timeout, a 500, a missing answer, an unconfident one —
 * comes back as `{ kind: "unknown" }`, and the caller reads that as "keep the answer you already
 * had". So the worst this can do to the bar is cost it a few hundred milliseconds and leave it
 * exactly where it is today. A judgment that improves a heuristic must not be able to break it.
 */
export const classifyIntent = async (input: Input): Promise<Intent> => {
  try {
    return readIntentAnswer(await judgeIntent(input));
  } catch (error) {
    // Logged and swallowed, not rethrown: the caller's fallback IS the current behaviour, so a
    // failure here is a non-event for the shopper and a line in the logs for us.
    console.error("classifyIntent could not reach a judgment", error);
    return { kind: "unknown" };
  }
};
