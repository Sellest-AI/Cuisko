import { describe, expect, it } from "vitest";

import { errorMessageOf } from "../errorMessage";

describe("errorMessageOf", () => {
  it("is an error's message, or the thrown value as text", () => {
    expect(errorMessageOf(new Error("Recipe not found"))).toBe("Recipe not found");
    expect(errorMessageOf("ECONNRESET")).toBe("ECONNRESET");
  });

  it("names the empty answer a gateway timeout leaves", () => {
    expect(errorMessageOf(new Error("  "))).toContain("no message");
  });
});
