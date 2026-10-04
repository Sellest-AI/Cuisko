import { describe, expect, test } from "vitest";

import { isAuthFlowPath } from "../auth-flow";

describe("isAuthFlowPath", () => {
  test("covers the sign-in page and every step of the onboarding", () => {
    expect(isAuthFlowPath("/auth")).toBe(true);
    expect(isAuthFlowPath("/onboarding/promise")).toBe(true);
    expect(isAuthFlowPath("/onboarding/import")).toBe(true);
  });

  test("leaves the app's own pages out, one whose name only starts like them included", () => {
    expect(isAuthFlowPath("/")).toBe(false);
    expect(isAuthFlowPath("/recipes")).toBe(false);
    expect(isAuthFlowPath("/share-import")).toBe(false);
    expect(isAuthFlowPath("/authors")).toBe(false);
  });
});
