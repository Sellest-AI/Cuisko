import { v, type Infer } from "convex/values";

/**
 * Every route a trace can start from, named as PostHog shows it in the `operation` property.
 *
 * A closed list rather than a free string so a typo is a type error: PostHog groups cost by this
 * value, and `ingredient/resolve` next to `ingredients/resolve` would split one route's average
 * in two without anything failing. A route is named by its router path, so the name says where
 * to look. Internal steps never appear here: they inherit the operation of the trace they join.
 */
export const OPERATIONS = [
  "assistant/classify",
  "assistant/sendMessage",
  "ingredients/resolve",
  "media/images/uploadOne",
  "media/images/uploadMany",
  "recipes/createOne",
  "recipes/importOne",
  "recipes/importVideo",
  "recipes/verifyOne",
  "recipes/regenerateRecipe",
] as const;

export type Operation = (typeof OPERATIONS)[number];

export const vOperation = v.union(...OPERATIONS.map((operation) => v.literal(operation)));

/**
 * What travels from one function to the next in the hidden `__trace` argument.
 *
 * `distinctId` is the caller's `users` id, the same id the app passes to PostHog's `identify`, so
 * backend cost joins app behaviour. `null` when the trace started with no signed-in caller.
 */
export const vTraceContext = v.object({
  traceId: v.string(),
  operation: vOperation,
  distinctId: v.union(v.string(), v.null()),
});

export type TraceContext = Infer<typeof vTraceContext>;
