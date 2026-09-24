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
  providerOptions: models.assistant.providerOptions({ effort: "low" }),
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
   * Enough for the prompt's "two or three tries, then answer without cards": each search is a step,
   * and the answer itself is one more.
   */
  maxSteps: 5,
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
 * The dish suggester behind `catalog:import`. Low effort: the job is naming well-known dishes of
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

export const translatorAgent = new Agent(components.agent, {
  name: "Cuisko Translator Agent",
  providerOptions: models.translator.providerOptions({ effort: false }),
  languageModel: models.translator.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

export const rankerAgent = new Agent(components.agent, {
  name: "Cuisko Ranker Agent",
  providerOptions: models.ranker.providerOptions({ effort: false }),
  languageModel: models.ranker.model,
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
