import * as z from "zod/v4";

/**
 * The words a model writes when it means "nothing".
 *
 * A field it has nothing to put in is the one place a model stops answering in the type it was
 * given: asked for a nullable string it writes `"null"`, `"none"` or `""` about as often as it
 * writes `null`, and every one of those is a *valid* string, so no schema rejects it. What lands
 * in the database is a recipe whose section is called "N/A".
 */
const _NOTHING_WORDS = new Set([
  "", "-", "--", "n/a", "na", "nil", "none", "no", "null", "nothing", "empty", "undefined",
  "unknown", "not applicable", "not specified", "not provided", "nan",
]);

/**
 * A string a model wrote, or `undefined` when it was its way of saying there is none.
 *
 * Anything that is not a string — `null`, a missing key, a number — is also `undefined`: the
 * caller asked for text and there is none, and the three cases have no different answer.
 */
export const modelText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;

  const text = value.trim();

  return _NOTHING_WORDS.has(text.toLowerCase()) ? undefined : text;
};

/**
 * A number a model wrote, or `undefined` when it was its way of saying there is none.
 *
 * Accepts the string forms too, because a model asked for a number under a description in prose
 * answers `"45"`, `"45 minutes"` or `"1,5"` — all of which mean the number, and none of which
 * survive `Number()`. `NaN` and `Infinity` are `undefined`: they are not answers.
 */
export const modelNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const text = modelText(value);
  if (text === undefined) return undefined;

  const parsed = Number.parseFloat(text.replace(/,/g, ".").replace(/[^\d.+-]/g, ""));

  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * `null` gone from a type, at every depth — what `parseModelOutput` leaves behind.
 *
 * A schema says `.nullable().optional()` because the *model* has to be allowed to write null; the
 * app never has to read one. Optional keys keep their `?`, so a field that may be absent stays
 * absent rather than becoming `T | null`, which is what a `Doc` written from this has to be.
 *
 * @limitation A field that is `.nullable()` alone keeps its null at runtime (`_unwrap`), and this
 * type still says it cannot. No answer schema has one; `sanitizeRecipe`'s input does, and reads it
 * through its own `z.infer`, not this.
 */
export type WithoutNulls<T> = T extends (infer Item)[]
  ? WithoutNulls<Item>[]
  : T extends object
  ? { [K in keyof T]: WithoutNulls<Exclude<T[K], null>> }
  : Exclude<T, null>;

/**
 * The parts of a zod v4 internal def this walk reads. `schema.def` is typed as the base def, which
 * carries only `type` — the three fields below exist on the subtypes the `type` string names, so
 * reading them is a cast rather than an `any`.
 */
type _Def = {
  type: string;
  innerType?: z.ZodType;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
};

const _def = (schema: z.ZodType) => schema.def as _Def;

/**
 * `.nullable()` and `.optional()` off, the answer to "is this field allowed to be absent?", and
 * what absent is written as there.
 *
 * ⚠️ `.nullable()` alone is not `.optional()`. Its absent is `null`, kept as a key: turned into a
 *    missing key, it fails the very schema that allowed it — `sanitizeRecipe`'s `outdated: null`
 *    did, and no recipe could be created.
 */
const _unwrap = (schema: z.ZodType) => {
  let inner = schema;
  let optional = false;
  let nullable = false;

  while (_def(inner).type === "optional" || _def(inner).type === "nullable") {
    if (_def(inner).type === "optional") optional = true;
    else nullable = true;
    inner = _def(inner).innerType!;
  }

  return { inner, absentable: optional || nullable, nothing: optional ? undefined : null };
};

/**
 * An item a list cannot mean: nothing at all, `null`, a number that is not one, or text that is one
 * of the words for nothing (`modelText`). Also what a required text field of a stand-in holds.
 */
const _isBlank = (value: unknown) =>
  value == null ||
  (typeof value === "number" && !Number.isFinite(value)) ||
  (typeof value === "string" && modelText(value) === undefined);

/**
 * An object item a model wrote as a stand-in: one of its required text fields is blank, as in
 * `{ ingredientId: "", quantity: 1, unit: "g" }`. It names nothing, so it cannot be a wrong answer
 * to refuse, only an empty one to drop.
 */
const _isStandIn = (element: z.ZodType, item: unknown) => {
  const { inner } = _unwrap(element);
  if (_def(inner).type !== "object" || item === null || typeof item !== "object") return false;

  return Object.entries(_def(inner).shape!).some(([key, field]) => {
    const { inner: fieldType, absentable } = _unwrap(field);

    return !absentable && _def(fieldType).type === "string" && _isBlank((item as Record<string, unknown>)[key]);
  });
};

/**
 * `forTool` is the input of a tool call rather than an answer. Two rules change with it: an item a
 * model wrote as a stand-in is dropped, and an absentable value that breaks its rule THROWS rather
 * than going absent, because a tool the model misused must say so (ADR 0010), where an answer is
 * better with a field missing than refused whole.
 */
type _Mode = { forTool: boolean };

/**
 * The value a model wrote, in the shape the schema at that position asks for.
 *
 * Only two things happen here, and both are per-leaf: a number field is read through
 * `modelNumber`, a string field through `modelText`. Objects and arrays exist to carry the walk
 * down to those leaves.
 */
const _clean = (schema: z.ZodType, value: unknown, mode: _Mode): unknown => {
  const { inner, absentable, nothing } = _unwrap(schema);
  const absent = absentable ? nothing : value;

  const cleaned = ((): unknown => {
    switch (_def(inner).type) {
      case "object": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return absent;

        const source = value as Record<string, unknown>;

        // The key is *omitted* rather than set to undefined: `v.optional()` reads an absent key,
        // and a key holding undefined is not the same value to Convex.
        return Object.entries(_def(inner).shape!).reduce<Record<string, unknown>>(
          (fields, [key, field]) => {
            const cleanedField = _clean(field, source[key], mode);
            if (cleanedField !== undefined) fields[key] = cleanedField;

            return fields;
          },
          {},
        );
      }

      case "array": {
        if (!Array.isArray(value)) return absent;

        // No list in the app holds a blank, a null, a NaN or a word for nothing, so an item that is
        // one is dropped rather than failing the list it sits in. A required list left empty then
        // fails its own `.min(1)`, as `[]` always did.
        const element = _def(inner).element!;
        const items = value
          .filter((item) => !_isBlank(item))
          .map((item) => _clean(element, item, mode))
          .filter((item) => !(mode.forTool && _isStandIn(element, item)));

        // A list the model may leave out, holding nothing once its empties are gone, was left out.
        // For a tool that includes `[]`; an answer keeps a `[]` it wrote, which says "none".
        const emptied = items.length === 0 && (mode.forTool || value.length > 0);

        return absentable && emptied ? nothing : items;
      }

      case "number": {
        const parsed = modelNumber(value);

        return parsed === undefined ? absent : parsed;
      }

      case "string": {
        const text = modelText(value);

        return text === undefined ? absent : text;
      }

      default:
        return value === null ? absent : value;
    }
  })();

  // The rule that makes a schema enough on its own: **a field allowed to be absent never fails,
  // it goes absent.** So `z.number().positive().nullable().optional()` is how a tool says "drop a
  // 0" — the 0 survives `modelNumber`, fails `.positive()`, and disappears here. No tool needs a
  // hand-written normalizer to express that, and a required field still fails loudly in `.parse`.
  if (!mode.forTool && absentable && cleaned != null && !inner.safeParse(cleaned).success) return nothing;

  return cleaned;
};

/**
 * A model's raw answer, coerced then validated against the schema it was generated from.
 *
 * The schema is doing double duty and that is the point: it constrains the model on the way out,
 * and on the way back it says which fields are allowed to be missing — which is exactly the
 * question `_clean` needs answered to know whether `"N/A"` is a value or a shrug. What a tool
 * writes is a schema; what it does not write is a normalizer.
 *
 * Strictness is untouched where it matters: a cuisine outside the enum, a missing quantity, a
 * required field the model skipped — all still throw, because none of them is a field the schema
 * marked absentable.
 */
export const parseModelOutput = <T extends z.ZodType>(
  schema: T,
  raw: unknown,
): WithoutNulls<z.infer<T>> => schema.parse(_clean(schema, raw, { forTool: false })) as WithoutNulls<z.infer<T>>;

/**
 * The arguments a model called a tool with, its stand-ins taken out, then validated.
 *
 * A model fills the fields it was told it may leave out: GPT-6 Luna, asked for two eggs, sent
 * `recipeIds: [""]` beside the real lines. Read as a bad id, that call is refused three times and
 * the cook gets no figure. So blank items leave their list, an object item with a blank required
 * text leaves it too, and a list the model may leave out that ends up empty goes absent.
 *
 * Everything else is still refused: an id that is not blank reaches the tool and is checked there,
 * a unit outside the enum throws here, by name, for the model to read and retry.
 */
export const parseToolInput = <T extends z.ZodType>(schema: T, raw: unknown): WithoutNulls<z.infer<T>> =>
  schema.parse(_clean(schema, raw, { forTool: true })) as WithoutNulls<z.infer<T>>;
