import * as z from "zod/v4";

/**
 * The parts of a zod v4 internal def this walk reads — the same four `parseModelOutput` reads, and
 * for the same reason: `schema.def` is typed as the base def, which carries only `type`, so the
 * subtype fields below are a narrow cast rather than an `any`.
 */
type _Def = {
  type: string;
  innerType?: z.ZodType;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  values?: unknown[];
  entries?: Record<string, unknown>;
};

const _def = (schema: z.ZodType) => schema.def as _Def;

/** `.describe()` back onto a rebuilt node — it lives on the schema instance, not in the def. */
const _keepDescription = (source: z.ZodType, rebuilt: z.ZodType) =>
  source.description === undefined ? rebuilt : rebuilt.describe(source.description);

/**
 * The numbers a `z.literal([1, 2, 3])` or a numeric `z.enum` admits, or nothing when it is not one.
 *
 * Both become an `enum` in the emitted JSON Schema, which is the point: it is the *values* being
 * numbers rather than which zod node produced them that a provider objects to.
 */
const _numericValues = (def: _Def): number[] | undefined => {
  const values =
    def.type === "literal" ? def.values
      : def.type === "enum" ? Object.values(def.entries ?? {})
        : undefined;

  if (!values?.length || !values.every((value) => typeof value === "number")) return undefined;

  return values as number[];
};

/**
 * A numeric enum as a range, with the exact values moved into the description.
 *
 * Google AI Studio rejects `enum` on anything but a string — `{ type: "integer", enum: [1,2,3,4,5] }`
 * is refused outright, and the message it refuses with names an unrelated property, which is how
 * this cost an afternoon. `{ type: "integer", minimum: 1, maximum: 5 }` is accepted everywhere
 * tried, so the constraint is said that way instead and the values are named in prose where the
 * model still reads them.
 *
 * It is a LOOSER schema than the one authored, deliberately: a range admits a value the enum did
 * not when the values are not contiguous. Nothing is lost by that, because the authored schema is
 * what `parseModelOutput` validates against on the way back — the model is guided outbound and
 * still judged inbound.
 */
const _range = (schema: z.ZodType, values: number[]) => {
  // `.int()` FIRST: applied after the bounds it replaces them with the safe-integer range, which
  // is a schema that constrains nothing.
  const integral = values.every((value) => Number.isInteger(value));
  const base = integral ? z.number().int() : z.number();

  return base.min(Math.min(...values)).max(Math.max(...values)).describe(
    [schema.description, `One of: ${values.join(", ")}.`].filter(Boolean).join(" "),
  );
};

/**
 * The same schema with every `.optional()` turned into `.nullable()`, at every depth.
 *
 * `.optional()` is what drops a key from `required` in the JSON Schema a schema becomes, and
 * OpenAI's strict structured output documents `required` as having to list every key in
 * `properties`. Measured rather than assumed, and the measurement has changed: as of 2026-08-25
 * OpenAI REFUSES a key missing from `required` — `[Azure] 'required' is required to be supplied
 * and to be an array including every key in properties` — where it used to accept one. So this
 * rewrite is no longer insurance against a documented someday; it is what makes the schema go
 * through at all. `providerSchema.manual.test.ts` sends that exact shape as `optional-key`, and
 * that row is the thing to re-read before anyone decides this walk is redundant.
 *
 * A tool keeps writing `.nullable().optional()` — the two wrappers say two different things and
 * both are needed. `.nullable()` is the model's permission to have no answer; `.optional()` is the
 * app's permission to read a missing key, which is what `parseModelOutput` consults on the way back
 * and what makes the parsed type carry a `?`. Only the outbound half is a problem, so only the
 * outbound half is rewritten: the model is handed a schema where the key is required and `null` is
 * a legal value for it, writes `null`, and the parser drops the key exactly as before.
 *
 * A field written `.optional()` alone becomes `.nullable()` rather than required, because forcing a
 * key on a model is how you get an invented value in it.
 *
 * The other rewrite is `_range`: a numeric `enum` becomes a range, because Google refuses `enum`
 * on anything but a string. Both are the same bargain — the outbound schema says what a provider
 * will accept, the authored schema stays what the answer is judged against. Both exist because a
 * named provider refused a measured shape, and both have a row in `providerSchema.manual.test.ts`
 * that will say so again. Nothing goes in this walk on the strength of documentation alone — and
 * nothing goes in it that the AI SDK already does on the way out, which is why there is no
 * `additionalProperties` rewrite here.
 */
const _strict = (schema: z.ZodType): z.ZodType => {
  const def = _def(schema);

  switch (def.type) {
    case "optional": {
      const inner = _strict(def.innerType!);

      return _keepDescription(
        schema,
        _def(def.innerType!).type === "nullable" ? inner : inner.nullable(),
      );
    }

    case "nullable":
      return _keepDescription(schema, _strict(def.innerType!).nullable());

    case "object": {
      const shape = Object.fromEntries(
        Object.entries(def.shape!).map(([key, field]) => [key, _strict(field)]),
      );

      // `object`, not `strictObject`, even though OpenAI requires `additionalProperties: false` on
      // every object it is handed: the AI SDK's `zod4Schema` stamps that onto every node itself
      // (`addAdditionalPropertiesToJsonSchema`), so a strict object here would buy nothing and
      // cost something — the SDK validates the answer against THIS schema, and strict turns a
      // model's extra key from silently stripped into a thrown generation.
      return _keepDescription(schema, z.object(shape));
    }

    case "array":
      // Rebuilding the array DROPS its own constraints — `minItems`, `maxItems`, `uniqueItems`,
      // `contains` — and keeps only the element schema and the description. That is not an
      // oversight to be fixed by copying the checks across: those four are documented by OpenAI as
      // unsupported in strict structured output, and an unsupported keyword is refused rather than
      // ignored, so carrying them over would take the whole request down for a bound the model was
      // never going to be held to anyway.
      //
      // The bound is still enforced, on the way back, by the authored schema — the same bargain as
      // `_range` above. What a caller must do is say it in `.describe()` as well, because prose is
      // all the model gets: `modelTranslationsSchema` names its locales in the description for
      // exactly this reason. `providerSchema.manual.test.ts` has the `array *` rows, and they are
      // what to re-read before anyone decides these checks should be preserved here.
      return _keepDescription(schema, z.array(_strict(def.element!)));

    default: {
      const values = _numericValues(def);

      return values ? _range(schema, values) : schema;
    }
  }
};

/**
 * The schema as a provider will accept it — what goes into `generateObject` / `Output.object`,
 * never into `parseModelOutput`.
 *
 * The returned type is a lie in exactly one direction, and it is the harmless one: the runtime
 * schema accepts `null` where `T` accepted an absent key, so every value it produces is still a
 * value `T` admits. Typing it as `T` is what lets a call site keep the inferred shape of the schema
 * it wrote, which is the shape the parsed answer actually has.
 */
export const providerSchema = <T extends z.ZodType>(schema: T): T => _strict(schema) as unknown as T;
