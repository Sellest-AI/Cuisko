import { Agent } from "@convex-dev/agent";
import { models } from "./config";
import { components } from "@convex/_generated/api";

export const defaultAgent = new Agent(components.agent, {
  name: "Cuisko",
  providerOptions: models.default.providerOptions({ effort: "low" }),
  languageModel: models.default.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

/**
 * The one agent a shopper talks to directly — the assistant modal.
 *
 * Its own agent rather than `defaultAgent` with extra arguments, even though the two share a model:
 * `defaultAgent` is the house one-shot judge, and everything about a conversation pulls the
 * opposite way from a judgement. The difference that matters is `recentMessages` — every other
 * agent in this file deliberately sits at 0, because a sanitizer that remembered the last recipe it
 * cleaned would contaminate the next one. A chat that remembers nothing cannot answer "and without
 * the cream?", which is most of what anyone asks it.
 *
 * `instructions` is empty here and supplied per call. The prompt is locale-dependent
 * (`config/prompts/assistant.ts`), and the locale belongs to the client's display language rather
 * than to the agent — so binding one here would pick a language at module load and keep it.
 *
 * `tools` is per call too, for a stricter reason: the recipe search closes over WHOSE recipes to
 * rank first. A tool set fixed on the agent would be one shared by every caller — see
 * `tools/searchRecipes.ts`.
 */
export const assistantAgent = new Agent(components.agent, {
  name: "Cuisko Assistant",
  providerOptions: models.assistant.providerOptions({ effort: false }),
  languageModel: models.assistant.model,
  instructions: "",
  /**
   * The last twenty messages — roughly ten exchanges, which outlasts any conversation that fits in
   * fifteen idle minutes. `searchOptions` stays off: vector search over past threads is what makes
   * an assistant bring up last Tuesday's dinner unprompted, and these threads are meant to be
   * short and self-contained.
   */
  contextOptions: { recentMessages: 20, searchOptions: { limit: 0 } },
  /**
   * Each tool call is a step, and the answer is one more. The longest honest turn is a nutrition
   * question: search the ingredients, search the recipes, compute, show, then a closing word, which
   * is five, and a failed display or a second search adds one each. Seven leaves that room. Too few
   * is not a cheaper turn but a broken one: cut on a tool call, the turn ends with nothing to say
   * and the screen can only report it failed.
   */
  maxSteps: 7,
  // usageHandler,
});

export const recipesAgent = new Agent(components.agent, {
  name: "Cuisko Recipes Agent",
  providerOptions: models.recipes.providerOptions({ effort: "medium" }),
  languageModel: models.recipes.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

/**
 * The dish suggester behind `seed:catalog`. Low effort: the job is naming well-known dishes of
 * a cuisine, and the script pays the wait for every call.
 */
export const catalogAgent = new Agent(components.agent, {
  name: "Cuisko Catalog Agent",
  providerOptions: models.catalog.providerOptions({ effort: "low" }),
  languageModel: models.catalog.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

export const ingredientsAgent = new Agent(components.agent, {
  name: "Cuisko Ingredient Agent",
  providerOptions: models.ingredients.providerOptions({ effort: "low" }),
  languageModel: models.ingredients.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

/**
 * The recipe verifier behind an admin's "Verify the recipe". `low`, because the model is already
 * the strong one (`models.verifier`): in the bake-off (`verifyRecipe.manual.test.ts`, 2026-10-03)
 * it was clean on every run in under a minute, and more effort only buys time the admin waits
 * through — the higher efforts of the models tried there ran past five minutes.
 */
export const verifierAgent = new Agent(components.agent, {
  name: "Cuisko Verifier Agent",
  providerOptions: models.verifier.providerOptions({ effort: "low" }),
  languageModel: models.verifier.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

export const translatorAgent = new Agent(components.agent, {
  name: "Cuisko Translator Agent",
  providerOptions: models.translator.providerOptions({ effort: false }),
  languageModel: models.translator.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

/**
 * The video importer behind `tools/extractVideoRecipe.ts`. `high`, unlike MiMo's `low`: GLM Flash
 * is cheap enough per token that the reasoning costs less than the retry it saves.
 */
export const videoRecipesAgent = new Agent(components.agent, {
  name: "Cuisko Video Recipes Agent",
  providerOptions: models.videoRecipes.providerOptions({ effort: "high" }),
  languageModel: models.videoRecipes.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

export const imagesGeneratorAgent = new Agent(components.agent, {
  name: "Cuisko Images Generator Agent",
  providerOptions: models.prompterMini.providerOptions({ effort: "low" }),
  languageModel: models.prompterMini.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});
