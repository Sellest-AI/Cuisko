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

export const recipesAgent = new Agent(components.agent, {
  name: "Cuisko Recipes Agent",
  providerOptions: models.recipes.providerOptions({ effort: "medium" }),
  languageModel: models.recipes.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});

export const ingredientsAgent = new Agent(components.agent, {
  name: "Cuisko Ingredient Agent",
  providerOptions: models.ingredients.providerOptions({ effort: false }),
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

