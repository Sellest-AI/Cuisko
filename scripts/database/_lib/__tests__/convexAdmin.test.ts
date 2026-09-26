/**
 * The deployment every ledger import is filed under. A wrong answer here files prod imports under
 * dev, or the reverse, and the ledger then skips recipes a deployment never received.
 */
import { describe, expect, it } from "vitest";

import { deploymentOf } from "../convexAdmin";

describe("deploymentOf", () => {
  it("reads the deployment from the key when the URL belongs to it", () => {
    expect(deploymentOf("dev:happy-otter-123|secret", "https://happy-otter-123.eu-west-1.convex.cloud")).toBe(
      "dev:happy-otter-123",
    );
    expect(deploymentOf("prod:calm-heron-456|secret", "https://calm-heron-456.convex.cloud")).toBe(
      "prod:calm-heron-456",
    );
  });

  it("refuses a URL that belongs to another deployment", () => {
    expect(() => deploymentOf("prod:calm-heron-456|secret", "https://happy-otter-123.convex.cloud")).toThrow(
      /CONVEX_URL/,
    );
  });

  it("refuses a URL whose host only starts with the same name", () => {
    expect(() => deploymentOf("dev:happy-otter-1|secret", "https://happy-otter-123.convex.cloud")).toThrow();
  });

  it("refuses a key with no deployment prefix", () => {
    expect(() => deploymentOf("secret", "https://happy-otter-123.convex.cloud")).toThrow(/dev:<name>\|/);
  });
});
