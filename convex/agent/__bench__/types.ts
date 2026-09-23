/**
 * The vocabulary a bake-off is described in.
 *
 * Everything here is about the SHAPE of a comparison, never about recipes — that is the whole
 * point of the folder. A bake-off is: some models, at some reasoning efforts, given one system
 * prompt and one input, judged against criteria the caller supplies.
 */
import type * as z from "zod/v4";

/**
 * How hard an entrant is asked to think.
 *
 * `false` is reasoning off — the setting the tools ship with. `"low"`, `"medium"` and `"high"` are
 * OpenRouter's own three levels, and each provider maps them to a budget of its own choosing.
 *
 * A NUMBER is that budget said directly: it becomes `reasoning.max_tokens` rather than
 * `reasoning.effort`. It is the only way to ask two different models to think for the same number
 * of tokens instead of for the same adjective — one vendor's "high" can be four times another's,
 * which makes an adjective a poor axis to compare a field on and a fine one to tune a single model
 * along. Mixing both in one `modes` list is legal and often what you want: `[false, "high", 2000]`
 * asks whether the budget or the label is what actually bought the quality.
 */
export type Effort = false | "low" | "medium" | "high" | "auto" | "max" | number;

/**
 * A model and the reasoning efforts to try it at.
 *
 * A model listed with several modes enters the bake-off several times, once per mode, and each
 * entry is scored on its own. That is the point: `[false, "high"]` asks whether the extra tokens
 * buy anything on THIS task, which is a different question from which model is best, and the only
 * honest way to answer it is to make both compete blind against everyone else.
 *
 * `[false]` alone is a model you only ever want to see cheap. Order the modes cheapest first — the
 * first one is the baseline every other mode's delta is measured against.
 */
export type Candidate = { name: string; modes: readonly Effort[] };

/** One model at one effort. The unit that is actually ranked. */
export type Entrant = { model: string; effort: Effort };

/**
 * How OpenRouter should pick a provider for every call in the bake-off.
 *
 * A subset of OpenRouter's routing block on purpose: `reasoning` and `usage` are NOT here, because
 * they are the harness's. `reasoning` is what the effort knob sets — the thing being measured —
 * and `usage` accounting is what makes the cost column real money rather than an estimate. Both
 * would silently break the table if a caller could turn them off.
 *
 * The same routing serves the judge, at its own effort: a provider you are ignoring for a reason
 * should be ignored for the ranking call too.
 */
export type ProviderRouting = {
  /** Default "throughput" — a bake-off is long enough already. */
  sort?: "throughput" | "price" | "latency";
  /** Try these providers, in this order. */
  order?: string[];
  /** Only these providers may serve the call. */
  only?: string[];
  /** Default ignores the three that have misreported or mangled structured output here. */
  ignore?: string[];
  /** Default `true`. Turn it off to measure ONE provider rather than a model. */
  allow_fallbacks?: boolean;
  /**
   * Default `true`. Only providers that support every parameter sent — structured output and the
   * reasoning setting — may serve the call. Off, OpenRouter may route to one that silently drops
   * `response_format`, and the table blames the model for the provider.
   */
  require_parameters?: boolean;
};

/**
 * One generation.
 *
 * `tokens` is what makes the mode comparison mean anything: "worth the extra tokens" is not a
 * judgement, it is a subtraction, and it needs the number. `reasoning` is the part of it the
 * effort setting actually bought — 0 on an entrant running with reasoning off, and the first thing
 * to look at when a mode scores identically to its baseline, because a provider that silently
 * ignored the setting looks exactly like a model that did not benefit from it.
 *
 * `flags` is what `Answer.check` found wrong, empty when it found nothing or when there was no
 * check. A flagged run still counts as a run — the tokens were spent and the cost is real — it is
 * just a run with known defects, and the judge is told about them.
 *
 * `output` is `unknown` on purpose. The harness only ever prints it for the judge, so pinning the
 * caller's type through here would buy nothing and cost every reader a type parameter.
 */
export type Attempt =
  | {
    ok: true;
    ms: number;
    tokens: number;
    reasoning: number;
    cost: number | undefined;
    flags: string[];
    output: unknown;
  }
  | { ok: false; ms: number; error: string };

/** The runs that produced something, narrowed. */
export type Success = Extract<Attempt, { ok: true }>;

/**
 * The shape the answer must take, the real parser it must survive, and the facts about it that
 * code can settle without asking a model.
 *
 * Omit `answer` entirely and the task is free text — the prose is what gets judged, and there is
 * nothing to parse or check.
 */
export type Answer<Raw, Parsed = Raw> = {
  schema: z.ZodType<Raw>;

  /**
   * The app's OWN parser. Passing it is the difference between measuring "did it write something
   * plausible" and "did it produce something the app can store" — a model whose answer the parser
   * throws on has failed the run, however good the prose was.
   */
  parse?: (raw: Raw) => Parsed;

  /**
   * Everything wrong with this answer that code can prove, one string per problem. Empty or
   * `undefined` means clean.
   *
   * This exists because a judge is unreliable at exactly what code is reliable at. Ask a model
   * "is every quantity a number" across fifteen answers and it will miss some, be generous about
   * others, and disagree with itself between runs — so the property you most want measured is the
   * one measured worst. A check settles it once, the same way every time, and the finding reaches
   * the judge as evidence rather than being left for it to notice.
   *
   * Write the message so it reads in a table with no other context: name the rule and quote the
   * value that broke it. `quantity "un filet" is not numeric` earns its column; `invalid` does not.
   *
   * A check that throws fails the run — it is your code, and a broken check should be loud rather
   * than quietly clean.
   */
  check?: (output: Parsed) => readonly string[] | undefined;
};

/**
 * Everything a bake-off needs. Only `title`, `candidates`, `system`, `prompt` and `criteria` are
 * required; the rest carry the defaults the first bake-off was written with.
 */
export type BakeOff<Raw, Parsed = Raw> = {
  /** Printed in the table header. Name the thing being chosen, not the file — "sanitizeRecipe". */
  title: string;

  /** The field. Edit this list — it is the knob a bake-off file exists for. */
  candidates: readonly Candidate[];

  /** The rules the candidates are given. In practice: the tool's real system prompt. */
  system: string;

  /** The input they are given, as the user message. In practice: the tool's real user prompt. */
  prompt: string;

  /** The output contract, the app's parser, and the deterministic checks. Omitted means text. */
  answer?: Answer<Raw, Parsed>;

  /**
   * How to weigh the candidates, heaviest first, in the caller's own words. One string per
   * criterion — the harness numbers them and appends the two it owns (consistency across runs,
   * then speed as a tie-break), because it is the harness that knows how many runs there were.
   *
   * Be specific enough that a verdict can cite a line. "Followed the prompt" ranks nothing.
   */
  criteria: readonly string[];

  /**
   * What the judge is told the candidates were asked to do, if that differs from `system`.
   *
   * Defaults to `system`, which is right almost always — the judge should grade against the rules
   * that were actually given. Override it when the system prompt is too long to re-send, or when
   * the judge needs context the candidates deliberately did not get.
   */
  rules?: string;

  /** How OpenRouter picks a provider. Defaults to throughput-sorted with fallbacks. */
  provider?: ProviderRouting;

  /** The one that ranks them. It never generates, so it is not in the running. */
  judge?: string;

  /** Per entrant. Three is enough to see a model that is good on average and wild in variance. */
  runs?: number;

  /**
   * How many generations are in flight at once, across every entrant.
   *
   * Modes multiply the field — five models averaging two modes each is ten entrants and thirty
   * calls — and thirty concurrent requests is how you get 429s from OpenRouter and a table full of
   * rate-limit failures that read like bad models. Raise it if your account is comfortable.
   */
  maxConcurrency?: number;

  /**
   * How long one generation may take before it is abandoned and scored as a failure.
   *
   * Defaults to five minutes. It is a cap on the whole attempt, retries included, and it applies
   * to the judge call as well. Raise it for a task whose honest answer is long; lowering it is how
   * you say "anything this slow is unshippable regardless of quality".
   *
   * There is no way to turn it off, and that is deliberate: a field of thirty-six calls where one
   * model never answers is thirty-five results you never see.
   */
  timeoutMs?: number;

  /**
   * The same, for the judge. Defaults to ten minutes — twice an entrant's, and its own number
   * rather than a multiple of `timeoutMs`.
   *
   * The judge reads every answer from every run in one prompt and always thinks at `high`, so it
   * is legitimately the slowest call in the bake-off; a budget inherited from the entrants would
   * abandon a judge that was working. Raise it when the field is large.
   */
  judgeTimeoutMs?: number;
};

/**
 * What the caller gets back, after the table has already been printed.
 *
 * It exists for the assertion, not for reading: the output of a bake-off is the table, and the
 * file at `path`. `ok` and `total` are what tell an empty run — a dead slug, a bad key — apart
 * from a field of bad models, and `clean` is `ok` minus the runs a check flagged.
 */
export type BakeOffResult = {
  ok: number;
  clean: number;
  total: number;
  spent: number;

  /**
   * Where the full transcript was written, relative to the repo root — every prompt, every answer,
   * every flag and the judge's notes, in one markdown file. See `transcript.ts` for who reads it.
   */
  path: string;
  entrants: Map<string, Entrant>;
  attempts: Map<string, Attempt[]>;
};
