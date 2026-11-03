import { describe, expect, it } from "vitest";

import { toProductRows } from "../products";

const SHAMPOO = { _id: "shampoo", name: "shampoo", emoji: "📦", quantity: 2, unit: "pcs" as const, updatedAt: 1000 };

describe("toProductRows", () => {
  it("maps a real row whole", () => {
    expect(toProductRows([SHAMPOO])).toEqual([
      { id: "shampoo", name: "shampoo", emoji: "📦", amount: 2, unit: "pcs", updatedAt: new Date(1000) },
    ]);
  });
});
