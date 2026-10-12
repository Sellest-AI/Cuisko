/**
 * What a call to a provider that reports no price costs, by our own estimate.
 *
 * OpenRouter returns each call's cost, so nothing here is about a model it serves. Replicate and
 * RunPod return how long the call ran, and the bill is that time on the provider's price list, so
 * every cost this file produces is sent to PostHog marked `estimated`.
 *
 * A model is priced per run when its provider bills per output, or per second when the provider
 * bills the GPU's time.
 *
 * @limitation The figures are list prices read by hand. A provider changing its price, or the RunPod
 * endpoint moving to another GPU, leaves them stale with nothing to say so; the OpenRouter-billed
 * share of a route's cost is unaffected.
 */
export type CostRate = { perRunUsd: number } | { perSecondUsd: number };

export const COST_RATES = {
  // Replicate bills these two by what they output, not by the second, at a price tiered by size
  // (prices of 2026-10-12). Both are written for the one size we render, so a render at another
  // size or thinking level needs its own figure here.
  //
  // $2.50 per thousand output megapixels in the 0.5 MP tier: the ingredient icon is 512×512.
  "prunaai/z-image-turbo": { perRunUsd: ((512 * 512) / 1_000_000) * (2.5 / 1000) },
  // $3 per thousand images at "very low" thinking and up to 1K: a recipe's cover (768×512) and plate (512×512).
  "prunaai/p-image-ideogram": { perRunUsd: 3 / 1000 },
  // RunPod serverless flex. The endpoint prefers the 16 GB class ($0.58 an hour) and falls back to
  // the 24 GB one ($0.69) when it is short, so most runs bill the first: $0.60 is the blend
  // (prices of 2026-09-27, GPU order as the endpoint was set up on 2026-10-12).
  "runpod/removeBackground": { perSecondUsd: 0.6 / 3600 },
} as const satisfies Record<string, CostRate>;

export type PricedModel = keyof typeof COST_RATES;

/** What one call ran, as its provider reported it, for the caller to record against its trace. */
export type RunUsage = {
  model: PricedModel;
  /** Billed run time. Absent when the provider did not say, and a per-second rate then has no cost. */
  seconds?: number;
  latencyMs: number;
};

/** Handed what a call ran, once it ran. Optional on every caller, so the call stays usable without one. */
export type ReportRun = (usage: RunUsage) => void | Promise<void>;

/** The estimate for one call, or `null` when it is billed by the second and the time is unknown. */
export const estimateCostUsd = ({ model, seconds }: Pick<RunUsage, "model" | "seconds">): number | null => {
  const rate: CostRate = COST_RATES[model];
  if ("perRunUsd" in rate) return rate.perRunUsd;

  return seconds === undefined ? null : seconds * rate.perSecondUsd;
};
