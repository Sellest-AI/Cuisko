/**
 * Which JSON Schema shapes will a provider actually accept?
 *
 * ⚠️ THIS COSTS MONEY — it calls OpenRouter for real and needs a real `OPENROUTER_API_KEY` in
 * `.env.local`:
 *
 *     pnpm test:manual                  # 2 calls per model. Every row should be green.
 *     PROBE_WHY=1 pnpm test:manual      # the diagnostic run — see `DIAGNOSE` below.
 *
 * The default run never sends a schema it expects to be refused. Nothing here fails on purpose:
 * a red row means something changed since the last run, and that is the only reason to look.
 *
 * It exists because a rejected schema and an incapable model look identical in a bake-off table:
 * both are a FAIL row, and the message is truncated to one line. Worse, the message itself lies —
 * Google answers a schema it cannot convert with `schema at top-level requires unspecified
 * property 'title'`, naming the first required key rather than the one it actually choked on. The
 * way to find the cause is to send shapes, not to read the message.
 *
 * **Every shape goes out in ONE request.** Each is a field of a single object, so the whole set
 * costs one call. Only under `PROBE_WHY` is a refused request re-sent shape by shape — the
 * provider usually names the offending property itself, and nine calls to confirm what the
 * message already said is nine calls.
 *
 * A shape nested in that request must be legal AS a nested object — `additionalProperties: false`
 * on every one of them. The wrapper that forgot it refused the group and read exactly like a
 * provider tightening its rules, which cost a bisect and an accusation.
 *
 * The prompts here are trivial on purpose: nothing about the ANSWER is being measured. What is
 * measured is whether the request was accepted at all, and the full error when it was not.
 *
 * **A CLEAN RUN IS ALL ✅ AND ENDS IN "Nothing new."** ✅ does not mean the request succeeded — it
 * means the row matched `KNOWN_REFUSALS`, so a schema that is SUPPOSED to be refused shows green
 * when it is refused. The only glyph worth stopping on is 🔔: a provider that started refusing
 * something, or started accepting something it used to refuse. Read the last line and stop there.
 *
 * There are no assertions, and vitest reports this file as passing whatever the providers said —
 * a provider tightening its schema rules is news, not a broken build, and a red run here would
 * only ever mean "someone spent money".
 */
import { describe, it } from "vitest";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, generateText, jsonSchema } from "ai";

import { modelRecipeSchema } from "../../tools/sanitizeRecipe";
import { providerSchema } from "../providerSchema";

// Add the model that just refused a schema. Ids are OpenRouter's — a wrong one fails every row
// with "model not found", which is a different answer from a rejected schema.
const MODELS = ["google/gemini-3.7-flash", "openai/gpt-5.6-luna"] as const;

type Outcome = { accepted: true; output: string } | { accepted: false; message: string };

/**
 * One call. Never throws — a refusal is the result being collected, not an error.
 *
 * `schema` is whatever `Output.object` accepts, and WHICH of the two you hand it decides what is
 * being measured. A zod schema is converted by the SDK, which stamps `additionalProperties: false`
 * onto every object on the way past (`addAdditionalPropertiesToJsonSchema`) — that is the document
 * production sends, so a question about `modelRecipeSchema` must be asked with the zod schema. A
 * `jsonSchema(...)` document is sent verbatim, which is what the raw shapes below need and why
 * they can probe a keyword the SDK would otherwise paper over. Converting a zod schema by hand and
 * wrapping THAT is the wrong half of both: it is neither production nor a controlled shape.
 */
const _call = async (model: string, schema: unknown, prompt: string): Promise<Outcome> => {
  try {
    const result = await generateText({
      model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! }).chat(model),
      // No `providerOptions`. Turning reasoning off looked like a free saving and cost two runs:
      // `reasoning: false` is refused by the provider's own Zod schema before the request leaves,
      // and `{ enabled: false, effort: "none" }` is refused by Gemini itself — "Reasoning is
      // mandatory for this endpoint". Both render here as a ❌ on every row, indistinguishable
      // from ten refused schemas. Send nothing but the schema: an option that fails fails
      // everything, and this file cannot tell you which of the two it was.
      system: "Answer with the object the schema asks for. Nothing else.",
      prompt,
      output: Output.object({ schema: schema as never }),
      maxRetries: 0,
    });

    return { accepted: true, output: JSON.stringify(result.output) };
  } catch (error) {
    // The WHOLE message, not the first sixty characters — being unreadable in the bake-off table
    // is the reason this file exists.
    return { accepted: false, message: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * The rows a provider is KNOWN to refuse, and the date it started. An ❌ on one of these is the
 * record holding — the schema `providerSchema` exists to rewrite, still being refused, exactly as
 * documented. Everything not listed here is expected to go through.
 *
 * This table is why the run can be read at a glance. Without it a refusal nobody is surprised by
 * prints the same as one that just started happening, and a whole screen of ❌ says only "a lot
 * happened", which is the state this file was written to get out of.
 */
const KNOWN_REFUSALS: Record<string, readonly string[]> = {
  // 2026-08-25 — `'required' … must include every key in properties`. An earlier run accepted it,
  // and that change is what turned `providerSchema`'s `.optional()` → `.nullable()` rewrite from
  // insurance into the thing keeping the schema legal.
  "optional-key": ["openai/gpt-5.6-luna"],

  // The bug this whole file documents, refused for a different reason by each: OpenAI over the
  // key missing from `required` in `timings`, Google over the numeric `enum` on `difficulty` —
  // which it now ACCEPTS and then cannot answer ("response did not match schema") rather than
  // refusing outright as it did when this was found.
  authored: MODELS,
};

const _isKnownRefusal = (model: string, label: string) =>
  KNOWN_REFUSALS[label]?.includes(model) ?? false;

/**
 * `PROBE_WHY=1 pnpm test:manual` — the diagnostic run, and the only one that spends money on
 * schemas already known to fail.
 *
 * A default run asks one question: is what we ship still accepted? That is two calls per model —
 * the open shapes as one object, and `providerSchema` itself — and every row of it should be
 * green. It deliberately does NOT re-send `authored`, does not re-send a `KNOWN_REFUSALS` row,
 * and does not take a refused group apart, because all three are ways of paying a provider to
 * reproduce a failure that is already written down here.
 *
 * Turn it on when a row goes 🔔 and the message is not enough to explain it — which is the case
 * this file was built for, Google having answered a schema it could not convert by naming an
 * unrelated property. Off, a refused group prints the provider's message and stops.
 */
const DIAGNOSE = process.env.PROBE_WHY === "1";

/** Rows that disagreed with `KNOWN_REFUSALS`. The only number worth reading at the end of a run. */
let _news = 0;

/**
 * ✅ means "what we recorded", NOT "the request succeeded" — a refusal listed in `KNOWN_REFUSALS`
 * is a green row, because it is the measurement holding. 🔔 is the whole point of the run: a
 * provider that started refusing something, or started accepting something it used to refuse.
 */
const _report = (model: string, label: string, outcome: Outcome, indent = "  ") => {
  const asRecorded = outcome.accepted !== _isKnownRefusal(model, label);

  if (!asRecorded) _news += 1;

  const note =
    asRecorded ? (outcome.accepted ? "" : "as recorded · ")
      : outcome.accepted ? "NEWS · now accepted · "
        : "NEWS · now refused · ";

  console.log(
    `${indent}${asRecorded ? "✅" : "🔔"} ${label.padEnd(20)} ${note}` +
    `${outcome.accepted ? outcome.output.slice(0, 70) : outcome.message}`,
  );
};

/** The line that answers "did anything change?", so nobody has to scan the rows to find out. */
const _summary = () => {
  console.log(_news ? `\n🔔 ${_news} row(s) disagreed with the record.` : "\nNothing new.");
  _news = 0;
};

/** A property name no provider will object to on its own, from a label written for a human. */
const _key = (label: string) => label.replace(/[^a-z0-9]+/gi, "_");

/**
 * Send every shape expected to pass as ONE object, and only take that apart when it is refused.
 *
 * A shape in `KNOWN_REFUSALS` goes on its own instead. It would otherwise take the other nine
 * down with it — one refused field refuses the request — and buy a ten-call bisect every single
 * run to re-learn the one thing already written down. So the group asks the open question, and
 * the known refusals are re-confirmed one call each, which is what they cost anyway.
 */
const _probe = async (model: string, shapes: Record<string, unknown>, prompt: string) => {
  const asks = Object.keys(shapes).filter((label) => !_isKnownRefusal(model, label));

  const together = await _call(
    model,
    jsonSchema({
      type: "object",
      properties: Object.fromEntries(asks.map((label) => [_key(label), shapes[label]])),
      required: asks.map(_key),
      additionalProperties: false,
    } as never),
    `${prompt} Fill every field the same way.`,
  );

  _report(model, `all ${asks.length} at once`, together);

  if (!together.accepted && !DIAGNOSE)
    console.log(
      `     ↳ the message above usually names the field. Re-run with PROBE_WHY=1 to spend ` +
      `${asks.length} more calls proving which shape it was.`,
    );

  if (!together.accepted && DIAGNOSE) {
    console.log("     ↳ refused together — re-sending each shape alone to find which one:");
    for (const label of asks)
      _report(model, label, await _call(model, jsonSchema(shapes[label] as never), prompt), "     ");
  }

  // Re-confirming a refusal costs a call and answers a question nobody asked. Under PROBE_WHY it
  // is worth it: that is when you want to know whether the record still holds.
  if (DIAGNOSE)
    for (const label of Object.keys(shapes).filter((label) => _isKnownRefusal(model, label)))
      _report(model, label, await _call(model, jsonSchema(shapes[label] as never), prompt));
};

/**
 * Each entry is one encoding of "a number, or nothing" — what `modelRecipeSchema` needs for its
 * timings, and what providers were SUSPECTED of disagreeing about.
 *
 * `optional-key` is no longer a suspicion. As of 2026-08-25 OpenAI REFUSES it — `'required' is
 * required to be supplied and to be an array including every key in properties` — where an earlier
 * run had it passing, and every other encoding here still passes. That row is the whole argument
 * for `providerSchema`'s `.optional()` → `.nullable()` rewrite, and it only became an argument
 * because the row kept being sent after it stopped being interesting.
 */
const NOTHING_SHAPES = {
  // What zod emits for `.nullable()`: a union with no `type` of its own.
  "anyOf-null": {
    type: "object",
    properties: {
      name: { type: "string" },
      minutes: { anyOf: [{ type: "number" }, { type: "null" }] },
    },
    required: ["name", "minutes"],
    additionalProperties: false,
  },

  // The same union said as a type array — draft-7 legal, and closer to what OpenAPI wants.
  "type-array-null": {
    type: "object",
    properties: { name: { type: "string" }, minutes: { type: ["number", "null"] } },
    required: ["name", "minutes"],
    additionalProperties: false,
  },

  // Google's own OpenAPI dialect: a real `type`, with nullability as a sibling flag.
  "nullable-flag": {
    type: "object",
    properties: { name: { type: "string" }, minutes: { type: "number", nullable: true } },
    required: ["name", "minutes"],
    additionalProperties: false,
  },

  // The key simply missing from `required`, which is what `.optional()` produces.
  "optional-key": {
    type: "object",
    properties: { name: { type: "string" }, minutes: { type: "number" } },
    required: ["name"],
    additionalProperties: false,
  },

  // The control. If this fails, the problem is not the schema.
  "no-null": {
    type: "object",
    properties: { name: { type: "string" }, minutes: { type: "number" } },
    required: ["name", "minutes"],
    additionalProperties: false,
  },
};

/**
 * Every way of saying "an integer from 1 to 5". THIS is the pair of rows that found the bug:
 * Google rejects `enum` on anything but a string, so `difficulty` — a `z.literal([1,2,3,4,5])` —
 * took the whole request down with it and blamed `title` while doing it. `integer + min/max` is
 * what `providerSchema` emits instead.
 */
const NUMBER_SHAPES = Object.fromEntries(
  Object.entries({
    "number + enum": { type: "number", enum: [1, 2, 3, 4, 5] },
    "integer + enum": { type: "integer", enum: [1, 2, 3, 4, 5] },
    "string + enum": { type: "string", enum: ["1", "2", "3", "4", "5"] },
    "integer + min/max": { type: "integer", minimum: 1, maximum: 5 },
    "number, bare": { type: "number", description: "1 to 5." },
  }).map(([label, difficulty]) => [
    label,
    // `additionalProperties: false` is scaffolding, not part of the shape under test — but it has
    // to be here, because these objects are NESTED inside the grouped request and OpenAI requires
    // the keyword on every nested object. Omitted, the wrapper refuses the whole group and the
    // failure reads as a provider change. Every shape in this file declares it for that reason.
    { type: "object", properties: { difficulty }, required: ["difficulty"], additionalProperties: false },
  ]),
);

/**
 * The two sets share one request and one prompt. They are declared apart because they answer
 * different questions, not because they cost anything to send together: a refusal is diagnosed
 * shape by shape regardless, so splitting the request in advance would only buy a second bill.
 */
const SHAPES: Record<string, Record<string, unknown>> = { ...NOTHING_SHAPES, ...NUMBER_SHAPES };

/** Enough facts to fill any field in `SHAPES`, and nothing worth grading. */
const PROMPT = `A dish called "toast": 3 minutes, difficulty 2 out of 5.`;

describe("what providers accept", () => {
  it("every shape, one request", { timeout: 300_000 }, async () => {
    for (const model of MODELS) {
      console.log(`\n── ${model} ${"─".repeat(Math.max(0, 50 - model.length))}`);

      await _probe(model, SHAPES, PROMPT);
    }

    _summary();
  });

  /**
   * The regression the other test exists to explain: the real schema, as authored and as
   * rewritten, against the models that have to run it. `authored` is in `KNOWN_REFUSALS` for BOTH
   * models — being refused is the bug, and a green ✅ on that row means the refusal happened as
   * recorded, not that the schema went through. `providerSchema` is the row that has to be
   * accepted. They go out separately: neither is a probe for the other.
   */
  it("modelRecipeSchema, authored and rewritten", { timeout: 300_000 }, async () => {
    // Both go in as ZOD, not as a document converted here: the SDK's own conversion is part of
    // what production sends, and hand-rolling it once made `timings` look refused for a keyword
    // the SDK adds for you.
    const prompt = "Toast: bread in the toaster, 3 minutes, serves 1.";

    for (const model of MODELS) {
      console.log(`\n── ${model} ${"─".repeat(Math.max(0, 50 - model.length))}`);

      // `authored` is the bug, and sending it is paying to watch it happen again. It goes out
      // under PROBE_WHY only — when the question is "is the rewrite still earning its keep?"
      // rather than "does what we ship still work?".
      if (DIAGNOSE) _report(model, "authored", await _call(model, modelRecipeSchema, prompt));

      _report(model, "providerSchema", await _call(model, providerSchema(modelRecipeSchema), prompt));
    }

    _summary();
  });
});
