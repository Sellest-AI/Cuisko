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
  providerOptions: models.recipes.providerOptions({ effort: "low" }),
  languageModel: models.recipes.model,
  instructions: "",
  contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
  maxSteps: 7,
  // usageHandler,
});
