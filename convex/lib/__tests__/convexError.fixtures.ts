import { ConvexError } from "convex/values";
import { expect } from "vitest";

/**
 * The `code` of the `ConvexError` a call throws, for tests that pin WHY something refused rather
 * than THAT it did. Fails the test when the call throws anything else, or nothing.
 */
export const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (caught) {
    expect(caught).toBeInstanceOf(ConvexError);
    return (caught as ConvexError<{ code: string }>).data.code;
  }
  throw new Error("expected a ConvexError");
};

/** `codeOf` for a promise: the code of the `ConvexError` it rejects with. */
export const rejectionCodeOf = async (promise: Promise<unknown>): Promise<string> => {
  const caught = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(ConvexError);
  return (caught as ConvexError<{ code: string }>).data.code;
};
