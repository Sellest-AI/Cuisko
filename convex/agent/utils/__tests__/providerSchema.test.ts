import { describe, expect, it } from "vitest";
import * as z from "zod/v4";

import { parseModelOutput } from "../parseModelOutput";
import { providerSchema } from "../providerSchema";

/**
 * The JSON Schema a provider actually receives. Everything asserted below is asserted on THIS —
 * the zod object is only the thing that produces it, and the bug being pinned was in the produced
 * document, not in the zod tree.
 */
const _json = (schema: z.ZodType) => z.toJSONSchema(providerSchema(schema), { io: "output" }) as {
  required?: string[];
  properties?: Record<string, unknown>;
};

describe("providerSchema", () => {
  it("lists every key of an object in `required`", () => {
    const { required, properties } = _json(
      z.object({
        title: z.string(),
        subtitle: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
    );

    expect(required?.sort()).toEqual(Object.keys(properties ?? {}).sort());
  });

  it("keeps `null` a legal value for what was optional", () => {
    const strict = providerSchema(z.object({ note: z.string().nullable().optional() }));

    expect(strict.safeParse({ note: null }).success).toBe(true);
    // The key is required now — dropping it is what providers rejected the schema over.
    expect(strict.safeParse({}).success).toBe(false);
  });

  it("makes a bare `.optional()` nullable rather than mandatory", () => {
    const strict = providerSchema(z.object({ note: z.string().optional() }));

    expect(strict.safeParse({ note: null }).success).toBe(true);
  });

  it("reaches optional fields nested in objects and arrays", () => {
    const strict = providerSchema(
      z.object({
        timings: z.object({ cooking: z.number().nullable().optional() }),
        groups: z.array(z.object({ title: z.string().nullable().optional() })),
      }),
    );

    expect(
      strict.safeParse({ timings: { cooking: null }, groups: [{ title: null }] }).success,
    ).toBe(true);
    expect(strict.safeParse({ timings: {}, groups: [{}] }).success).toBe(false);
  });

  it("keeps the descriptions the model reads at generation time", () => {
    const { properties } = _json(
      z.object({ note: z.string().nullable().optional().describe("A note, or null.") }),
    );

    expect(JSON.stringify(properties?.note)).toContain("A note, or null.");
  });

  it("turns a numeric enum into a range, which is the only form Google accepts", () => {
    const { properties } = _json(z.object({ difficulty: z.literal([1, 2, 3, 4, 5]) }));
    const difficulty = properties?.difficulty as Record<string, unknown>;

    expect(difficulty.enum).toBeUndefined();
    expect(difficulty).toMatchObject({ type: "integer", minimum: 1, maximum: 5 });
  });

  it("names the values it dropped from a numeric enum in the description", () => {
    const { properties } = _json(
      z.object({ difficulty: z.literal([1, 2, 3, 4, 5]).describe("How hard.") }),
    );

    expect((properties?.difficulty as { description?: string }).description)
      .toBe("How hard. One of: 1, 2, 3, 4, 5.");
  });

  it("leaves a string enum alone — it is the numbers a provider objects to", () => {
    const { properties } = _json(z.object({ cuisine: z.enum(["french", "italian"]) }));

    expect(properties?.cuisine).toMatchObject({ type: "string", enum: ["french", "italian"] });
  });

  it("hands `parseModelOutput` a null the original schema turns back into an absent key", () => {
    const authored = z.object({ note: z.string().nullable().optional() });

    // The round trip the fix exists for: the model answers `null` because the strict schema made
    // the key required, and the authored schema is still what decides the key goes away.
    const strict = providerSchema(authored);
    const generated = strict.parse({ note: null });

    expect(parseModelOutput(authored, generated)).toEqual({});
  });
});
