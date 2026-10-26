"use node"
import { env } from "@convex/env";
import type { ReportRun } from "@convex/lib/costRates";
import runpodSdk from "runpod-sdk";
import * as z from "zod/v4";

const runpod = runpodSdk(env.RUNPOD_API_KEY);
const endpoint = runpod.endpoint("e53gyrt44m46b6");

/**
 * What the worker returns, parsed rather than asserted.
 *
 * `runSync` resolves with a status envelope, not only a payload: a timed-out or failed worker
 * still resolves, just without `output`. The previous `as Output` cast made that indistinguishable
 * from success, and the failure surfaced two calls away as `Cannot read properties of undefined
 * (reading 'url')` inside `generateIngredientImage` — a message that names neither RunPod nor the
 * status that caused it.
 */
const outputSchema = z.object({
  url: z.string(),
  position: z.object({
    left: z.number(),
    top: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

type Output = z.infer<typeof outputSchema>;

/** The worker's model and silhouette pass. Left out, the worker uses its own defaults. */
type Options = {
  model?: "matting" | "lite-matting" | "dynamic-matting" | "general" | "lite" | "dynamic" | "portrait" | "lucida" | "sellestia";
  silhouette?: "off" | "fill" | "sam";
};

/**
 * `report` is handed the run's billed time before the output is checked: a worker that answers
 * unusably was still paid for. RunPod reports `executionTime` in milliseconds.
 */
export const removeBackground = async (url: string, report?: ReportRun, options: Options = {}): Promise<Output> => {
  if (!endpoint) throw new Error("RunPod endpoint not found");

  const startedAt = Date.now();
  const result = await endpoint.runSync({
    input: {
      image_url: url,
      ...options,
      // image_data_url: base64,
    }
  })

  const executionMs = result && "executionTime" in result ? result.executionTime : undefined;
  await report?.({
    model: "runpod/removeBackground",
    seconds: executionMs === undefined ? undefined : executionMs / 1000,
    latencyMs: Date.now() - startedAt,
  });

  const parsed = outputSchema.safeParse(result?.output);
  if (!parsed.success)
    throw new Error(
      `RunPod removeBackground returned no usable output (status: ${result?.status ?? "unknown"}): ${parsed.error.message}`
    );

  return parsed.data;
}
