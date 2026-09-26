import {
  type AssistantButton,
  BUTTON_DESTINATIONS,
  BUTTON_VARIANTS,
} from "@shared/assistant";
import z from "zod/v4";

import { createTool } from "../utils";

/**
 * How the assistant hands the cook a way into another part of the app: a sentence it writes, and a
 * pill under it that goes somewhere.
 *
 * **The model picks a destination by name and never writes a route.** The client maps the name to
 * a screen and a translated label when it draws the pill, so a route that moves, or a model that
 * invents one, cannot produce a button to nowhere. The sentence is the model's, because it is the
 * part that has to fit the conversation: "want the whole week planned?" after a week of dinners,
 * something else after a shopping question.
 */

/** Two short sentences at most. It sits above a button, under an answer that already said its piece. */
const MAX_TEXT = 200;

const _inputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TEXT)
    .describe("One short sentence shown just above the button, leading into it. Never an id."),
  destination: z
    .enum(BUTTON_DESTINATIONS)
    .describe(
      "Where the button goes. \"planning\" builds the cook a plan for their week, \"groceries\" " +
      "opens their shopping list or cellar, \"recipes\" opens the recipes catalog and their recipe book.",
    ),
  variant: z
    .enum(BUTTON_VARIANTS)
    .describe(
      "The button's colour. \"primary\" is orange, for planning. \"secondary\" is green, for " +
      "groceries and recipes. \"neutral\" is grey, for anything else.",
    ),
});

export const showButtonTool = createTool({
  description:
    "Shows the cook a button to another part of the app, under your answer and any recipe cards, " +
    "with your sentence above it. At most once per answer.",
  inputSchema: _inputSchema,
  execute: async (_ctx, input: z.infer<typeof _inputSchema>): Promise<AssistantButton> => ({
    v: 1,
    ...input,
  }),
});
