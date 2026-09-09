import { describe, expect, test } from "vitest";

import type { AggregatedConstraints, PreferenceValues } from "@shared/preferences";

import {
  constraintsOf,
  mineOf,
  runConstraintsOf,
  toggleConstraint,
  type Constraint,
  type ConstraintValue,
} from "../constraints";

const NOBODY: AggregatedConstraints = { diet: "omnivore", avoids: [] };

const mine = (values: Partial<PreferenceValues> = {}): PreferenceValues => ({
  diet: "omnivore",
  avoids: [],
  seeks: [],
  ...values,
});

const chipFor = (constraints: Constraint[], value: ConstraintValue) =>
  constraints.find((constraint) => constraint.value === value);

describe("constraintsOf", () => {
  test("offers every diet but omnivore, and every allergen", () => {
    const constraints = constraintsOf(mine(), NOBODY);

    expect(constraints.map((constraint) => constraint.value)).toContain("vegan");
    expect(constraints.map((constraint) => constraint.value)).toContain("gluten");
    // omnivore constrains nothing, so a chip for it could only be switched on to no effect.
    expect(constraints.map((constraint) => constraint.value)).not.toContain("omnivore");
  });

  test("ticks nothing when nobody has answered", () => {
    const constraints = constraintsOf(mine(), NOBODY);

    expect(constraints.every((constraint) => !constraint.active)).toBe(true);
    expect(constraints.every((constraint) => constraint.source === undefined)).toBe(true);
  });

  test("marks the caller's own answers `mine`", () => {
    const constraints = constraintsOf(mine({ diet: "vegan", avoids: ["gluten"] }), NOBODY);

    expect(chipFor(constraints, "vegan")).toEqual({ value: "vegan", source: "mine", active: true });
    expect(chipFor(constraints, "gluten")).toEqual({ value: "gluten", source: "mine", active: true });
  });

  test("marks a housemate's answers `inherited`", () => {
    const constraints = constraintsOf(mine(), { diet: "vegan", avoids: ["gluten"] });

    expect(chipFor(constraints, "vegan")?.source).toBe("inherited");
    expect(chipFor(constraints, "gluten")?.source).toBe("inherited");
  });

  test("marks a constraint both of us hold `both`", () => {
    const constraints = constraintsOf(mine({ diet: "vegan", avoids: ["gluten"] }), {
      diet: "vegan",
      avoids: ["gluten"],
    });

    expect(chipFor(constraints, "vegan")?.source).toBe("both");
    expect(chipFor(constraints, "gluten")?.source).toBe("both");
  });

  /** The order is the vocabulary's, so a chip never moves between renders or between runs. */
  test("keeps the vocabulary order whatever was answered", () => {
    const answered = constraintsOf(mine({ avoids: ["milk", "gluten"] }), { diet: "vegan", avoids: ["nuts"] });

    expect(answered.map((constraint) => constraint.value)).toEqual(
      constraintsOf(mine(), NOBODY).map((constraint) => constraint.value),
    );
  });
});

/**
 * Every row of the toggle table, in the plan's own order. The two rules being tested are:
 * the week always follows the visible tick, and your row follows it only for values that were
 * yours.
 */
describe("toggleConstraint", () => {
  /** Row one — unticked, ticked: added to my row, applied to the week. */
  test("ticking an unheld constraint adds it to my row", () => {
    const before = constraintsOf(mine(), NOBODY);
    const after = toggleConstraint(before, "gluten");

    expect(chipFor(after, "gluten")).toEqual({ value: "gluten", source: "mine", active: true });
    expect(mineOf(after).avoids).toEqual(["gluten"]);
    expect(runConstraintsOf(after).avoids).toEqual(["gluten"]);
  });

  /** Row two — ticked, mine only, unticked: removed from my row, dropped from the week. */
  test("unticking a constraint that is only mine removes it from my row", () => {
    const before = constraintsOf(mine({ avoids: ["gluten"] }), NOBODY);
    const after = toggleConstraint(before, "gluten");

    expect(chipFor(after, "gluten")).toEqual({ value: "gluten", source: undefined, active: false });
    expect(mineOf(after).avoids).toEqual([]);
    expect(runConstraintsOf(after).avoids).toEqual([]);
  });

  /**
   * Row three — ticked, inherited only, unticked: my row untouched, dropped from the week. This is
   * what makes `strictestDietOf` livable — the week Ana is away, unticking her vegan gives the rest
   * of the table meat back without touching her row.
   */
  test("unticking an inherited constraint drops the week and writes nothing", () => {
    const before = constraintsOf(mine(), { diet: "vegan", avoids: [] });
    const after = toggleConstraint(before, "vegan");

    expect(chipFor(after, "vegan")).toEqual({ value: "vegan", source: "inherited", active: false });
    expect(mineOf(after).diet).toBe("omnivore");
    expect(runConstraintsOf(after).diet).toBe("omnivore");
  });

  /**
   * Row four — ticked, mine AND inherited, unticked: removed from my row, dropped from the week.
   * A control that survives being switched off is broken however good the reason, so the week goes;
   * the cost is that my own row now says omnivore until I re-tick.
   */
  test("unticking a constraint that is mine and inherited clears it from my row too", () => {
    const before = constraintsOf(mine({ diet: "vegan" }), { diet: "vegan", avoids: [] });
    const after = toggleConstraint(before, "vegan");

    expect(chipFor(after, "vegan")).toEqual({ value: "vegan", source: "inherited", active: false });
    expect(mineOf(after).diet).toBe("omnivore");
    expect(runConstraintsOf(after).diet).toBe("omnivore");
  });

  /**
   * Row five, the load-bearing one — inherited and left alone: applied to the week, and never
   * folded into my row. This is what stops a member inheriting a housemate's answer by pressing
   * next, and it is what retired the conditional `seedIfAbsent` write.
   */
  test("an inherited constraint left untouched never enters my row", () => {
    const constraints = constraintsOf(mine(), { diet: "vegan", avoids: ["gluten"] });

    expect(runConstraintsOf(constraints)).toEqual({ diet: "vegan", avoids: ["gluten"] });
    expect(mineOf(constraints)).toEqual({ diet: "omnivore", avoids: [] });
  });

  /** Re-ticking is a tick like any other: it is the one gesture that ever writes. */
  test("re-ticking an inherited constraint adopts it as mine as well", () => {
    const before = constraintsOf(mine(), { diet: "vegan", avoids: [] });
    const dropped = toggleConstraint(before, "vegan");
    const after = toggleConstraint(dropped, "vegan");

    expect(chipFor(after, "vegan")).toEqual({ value: "vegan", source: "both", active: true });
    expect(mineOf(after).diet).toBe("vegan");
  });

  test("unticking always drops it from the week, whatever the source", () => {
    const sources: AggregatedConstraints[] = [NOBODY, { diet: "omnivore", avoids: ["gluten"] }];

    for (const others of sources) {
      const before = constraintsOf(mine({ avoids: ["gluten"] }), others);
      const after = toggleConstraint(before, "gluten");

      expect(runConstraintsOf(after).avoids).toEqual([]);
    }
  });

  test("touches no other chip and never mutates the list it was given", () => {
    const before = constraintsOf(mine({ avoids: ["gluten"] }), { diet: "vegan", avoids: ["milk"] });
    const snapshot = JSON.stringify(before);

    const after = toggleConstraint(before, "nuts");

    expect(JSON.stringify(before)).toBe(snapshot);
    expect(chipFor(after, "gluten")).toEqual(chipFor(before, "gluten"));
    expect(chipFor(after, "milk")).toEqual(chipFor(before, "milk"));
    expect(chipFor(after, "vegan")).toEqual(chipFor(before, "vegan"));
  });

  /**
   * No toggle can report a housemate's row as anything but inherited, which is what makes `save`
   * safe to call from a screen displaying the whole household's constraints.
   */
  test("no sequence of toggles puts an untouched inherited value into my row", () => {
    const before = constraintsOf(mine(), { diet: "vegan", avoids: ["gluten", "milk"] });
    const after = ["nuts", "fish", "nuts"].reduce(
      (constraints, value) => toggleConstraint(constraints, value as ConstraintValue),
      before,
    );

    expect(mineOf(after)).toEqual({ diet: "omnivore", avoids: ["fish"] });
  });
});

describe("mineOf and runConstraintsOf", () => {
  test("resolve two ticked diets to the strictest of them", () => {
    const before = constraintsOf(mine({ diet: "pescatarian" }), NOBODY);
    const after = toggleConstraint(before, "vegan");

    expect(mineOf(after).diet).toBe("vegan");
    expect(runConstraintsOf(after).diet).toBe("vegan");
  });

  test("report omnivore and nothing avoided when no chip is ticked", () => {
    const constraints = constraintsOf(mine(), NOBODY);

    expect(mineOf(constraints)).toEqual({ diet: "omnivore", avoids: [] });
    expect(runConstraintsOf(constraints)).toEqual({ diet: "omnivore", avoids: [] });
  });

  /** Sorted into ALLERGENS' own order, so two identical answers compare equal as arrays. */
  test("return avoids in the vocabulary order", () => {
    const constraints = constraintsOf(mine({ avoids: ["milk", "gluten"] }), NOBODY);

    expect(mineOf(constraints).avoids).toEqual(["gluten", "milk"]);
  });
});
