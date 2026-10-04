/**
 * Reading the JSON a platform embeds in its page, which every adapter does and none may trust:
 * the shape is the platform's to change without notice.
 */

export type Json = Record<string, unknown>;

export const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null;

/**
 * A script that is not JSON is one we cannot read, which is a changed page, not a crash: it reaches
 * the cook as `IMPORT_UNAVAILABLE` like any other missing post, never as a `SyntaxError`.
 */
export const parsedJsonOrNull = (script: string): unknown => {
  try {
    return JSON.parse(script) as unknown;
  } catch (caught) {
    if (caught instanceof SyntaxError) return null;
    throw caught;
  }
};
