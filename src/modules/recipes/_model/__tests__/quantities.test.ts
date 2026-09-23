import { describe, expect, test } from "vitest";

import type { RecipeLine } from "../detail";
import {
  ingredientsIn,
  readInstruction,
  scaleInstruction,
  scaleInstructions,
} from "../quantities";

const line = (name: string, unit: RecipeLine["unit"] = "g"): RecipeLine => ({
  name,
  unit,
  quantity: 100,
  category: "VEGETABLE",
  emoji: "🥕",
});

const LINES: RecipeLine[] = [
  line("Tomates", "pcs"),
  line("Oignon", "pcs"),
  line("Farine"),
  line("Huile d'olive", "ml"),
  line("Pommes de terre", "pcs"),
];

describe("scaleInstruction", () => {
  test("scales a bare count and the ingredient it names", () => {
    expect(scaleInstruction("Concassez 4 tomates.", LINES, 4, 8)).toBe("Concassez 8 tomates.");
    expect(scaleInstruction("Concassez 4 tomates.", LINES, 4, 2)).toBe("Concassez 2 tomates.");
  });

  test("scales a quantity written with a unit, glued or spaced", () => {
    expect(scaleInstruction("Ajoutez 200 g de farine", LINES, 4, 2)).toBe("Ajoutez 100 g de farine");
    expect(scaleInstruction("Ajoutez 200g de farine", LINES, 4, 6)).toBe("Ajoutez 300g de farine");
  });

  /**
   * The rule the whole file exists to keep. An oven is not an ingredient, so no factor can reach
   * it — and a doubled temperature is a burnt dish, not a rounding complaint.
   */
  test("never touches a temperature", () => {
    const text = "Préchauffez le four à 180°C, puis 200 °C pour la fin.";
    expect(scaleInstruction(text, LINES, 4, 8)).toBe(text);
  });

  test("never touches a duration", () => {
    const text = "Faites cuire 10 minutes, puis 2 h au repos, puis 30 sec de plus.";
    expect(scaleInstruction(text, LINES, 4, 8)).toBe(text);
  });

  test("never touches a number that names nothing in this recipe", () => {
    const text = "Réservez 3 assiettes et réglez le thermostat 6.";
    expect(scaleInstruction(text, LINES, 4, 2)).toBe(text);
  });

  /** "8 à 10 minutes" is a range of times; the first number must not be read as a count. */
  test("never touches the low end of a time range", () => {
    const text = "Laissez colorer 8 à 10 minutes.";
    expect(scaleInstruction(text, LINES, 4, 8)).toBe(text);
  });

  test("scales several amounts in one sentence, and only those", () => {
    expect(
      scaleInstruction("Faites revenir 2 oignons et 4 tomates 10 minutes à 180°C.", LINES, 4, 2),
    ).toBe("Faites revenir 1 oignons et 2 tomates 10 minutes à 180°C.");
  });

  test("reads fractions and comma decimals, and writes back in the same notation", () => {
    /** A centilitre is a whole number on the ingredients tab, so 0,75 reads 1 in the method too. */
    expect(scaleInstruction("Versez 1,5 cl d'huile d'olive", LINES, 4, 2)).toBe(
      "Versez 1 cl d'huile d'olive",
    );
    expect(scaleInstruction("Versez 1/2 cuillère d'huile d'olive", LINES, 4, 8)).toBe(
      "Versez 1 cuillère d'huile d'olive",
    );
  });

  /** A cook reads a recipe, not arithmetic — and to the precision the ingredients tab uses. */
  test("rounds what does not divide evenly", () => {
    expect(scaleInstruction("Ajoutez 200 g de farine", LINES, 3, 1)).toBe("Ajoutez 67 g de farine");
  });

  /** A bare count has no unit to take a precision from, so it keeps the single decimal. */
  test("keeps one decimal on a number the sentence gave no unit", () => {
    expect(scaleInstruction("Faites revenir 2 oignons", LINES, 3, 1)).toBe("Faites revenir 0.7 oignons");
  });

  /**
   * The measure is the whole evidence here: the recipe stores `Citron`, the method says "jus de
   * citron", and a matcher that called those the same thing would be a matcher that links a lemon
   * to lemon juice in the catalog too. "2 cs" is a quantity in any sentence, so it scales anyway.
   */
  test("scales a measured amount whose ingredient it cannot name", () => {
    expect(
      scaleInstruction(
        "Mélanger 350 g de yaourt nature, 2 cs de jus de citron",
        [line("Yaourt nature"), line("Citron", "pcs")],
        4,
        8,
      ),
    ).toBe("Mélanger 700 g de yaourt nature, 4 cs de jus de citron");
  });

  test("scales a measured amount in a recipe with no lines at all", () => {
    expect(scaleInstruction("Ajoutez 1 pincée de sumac", [], 4, 8)).toBe("Ajoutez 2 pincée de sumac");
  });

  /** A pan is not food, and doubling a recipe does not buy the cook a bigger casserole. */
  test("never touches a container's own capacity", () => {
    const text = "Portez à ébullition dans une casserole de 3 l.";
    expect(scaleInstruction(text, [line("Eau", "l")], 4, 8)).toBe(text);
  });

  /** The innocent half of that shape — the pan is where it goes, not what is being measured. */
  test("still scales an amount that merely names where it goes", () => {
    expect(scaleInstruction("Versez dans le bol 200 g de farine", LINES, 4, 2)).toBe(
      "Versez dans le bol 100 g de farine",
    );
  });

  test("never touches a size in centimetres", () => {
    const text = "Étalez sur 3 cm dans un moule de 24 cm.";
    expect(scaleInstruction(text, LINES, 4, 8)).toBe(text);
  });

  test("matches a multi-word ingredient name", () => {
    expect(scaleInstruction("Épluchez 6 pommes de terre", LINES, 6, 3)).toBe(
      "Épluchez 3 pommes de terre",
    );
  });

  /** The stepper's resting position has to be identical to not having a stepper at all. */
  test("returns the instruction untouched at the servings it was written for", () => {
    const text = "Concassez 4 tomates.";
    expect(scaleInstruction(text, LINES, 4, 4)).toBe(text);
  });

  /** A recipe that serves nobody has no ratio, and dividing by it would produce infinities. */
  test("refuses to scale from a servings count of zero or less", () => {
    const text = "Concassez 4 tomates.";
    expect(scaleInstruction(text, LINES, 0, 4)).toBe(text);
    expect(scaleInstruction(text, LINES, -2, 4)).toBe(text);
  });

  /** A bare count has only the match to go on, so with no lines there is no evidence at all. */
  test("leaves an unmeasured count alone when the recipe has no lines to match against", () => {
    const text = "Concassez 4 tomates.";
    expect(scaleInstruction(text, [], 4, 8)).toBe(text);
  });
});

describe("readInstruction", () => {
  /** The invariant that makes an unrecognised number a no-op rather than a rewrite. */
  test("reproduces the instruction exactly when its segments are joined", () => {
    const text = "Faites revenir 2 oignons 10 minutes à 180°C, puis 4 tomates.";
    expect(
      readInstruction(text, LINES)
        .map((segment) => segment.text)
        .join(""),
    ).toBe(text);
  });

  test("marks only the numbers it could tie to an ingredient", () => {
    const marked = readInstruction("2 oignons, 10 minutes, 180°C, 4 tomates", LINES).filter(
      (segment) => segment.amount !== undefined,
    );

    expect(marked.map((segment) => segment.amount)).toEqual([2, 4]);
    expect(marked.map((segment) => segment.line?.name)).toEqual(["Oignon", "Tomates"]);
  });

  /** The measure only: the ingredient's name is not part of the quantity. */
  test("reaches past the number to the end of its measure", () => {
    const reachOf = (text: string, lines = LINES) => {
      const segment = readInstruction(text, lines).find((part) => part.amount !== undefined)!;
      const start = text.indexOf(segment.text) + segment.text.length;

      return text.slice(start, start + segment.reach!);
    };

    expect(reachOf("Ajoutez 200 g de farine.")).toBe(" g");
    expect(reachOf("Ajoutez 200g de farine.")).toBe("g");
    expect(reachOf("Ajoutez 2 cuillères à soupe d'huile d'olive")).toBe(" cuillères à soupe");
    expect(reachOf("Ajoutez 2 cs de jus de citron", [line("Citron", "pcs")])).toBe(" cs");
    expect(reachOf("Concassez 4 tomates")).toBe("");
  });

  test("carries the unit the cook spelled, when the app stores one", () => {
    expect(readInstruction("Ajoutez 200 g de farine", LINES)[1]?.unit).toBe("g");
    expect(readInstruction("Concassez 4 tomates", LINES)[1]?.unit).toBeUndefined();
  });

  /** A slice is a unit the app stores now; a clove still is not, because a clove is a piece. */
  test("reads a slice as a slice, never as a piece", () => {
    expect(readInstruction("Toastez 8 tranches de pain", [line("Pain", "pcs")])[1]?.unit).toBe("slice");
    expect(readInstruction("Écrasez 2 gousses d'ail", [line("Ail", "pcs")])[1]?.unit).toBeUndefined();
  });
});

describe("ingredientsIn", () => {
  test("returns what the step calls for, with the amount the step states", () => {
    expect(
      ingredientsIn("Mélangez 200 g de farine et 2 oignons 10 minutes", LINES).map((mention) => ({
        name: mention.line.name,
        amount: mention.amount,
        unit: mention.unit,
      })),
    ).toEqual([
      { name: "Farine", amount: 200, unit: "g" },
      { name: "Oignon", amount: 2, unit: "pcs" },
    ]);
  });

  /** A bare count is a count of things, whatever unit the recipe stores that ingredient in. */
  test("falls back to pieces rather than borrowing the line's own unit", () => {
    expect(ingredientsIn("Concassez 4 tomates", LINES)[0]?.unit).toBe("pcs");
  });

  test("lists an ingredient named twice only once", () => {
    expect(ingredientsIn("Versez 100 g de farine, puis 50 g de farine", LINES)).toHaveLength(1);
  });

  test("returns nothing for a step that states no amount", () => {
    expect(ingredientsIn("Laissez reposer 10 minutes.", LINES)).toEqual([]);
  });

  /** The amount scales, but there is no ingredient to put a glyph and a name beside. */
  test("skips an amount recognised by its measure alone", () => {
    expect(ingredientsIn("Ajoutez 2 cs de jus de citron", [line("Citron", "pcs")])).toEqual([]);
  });
});

describe("scaleInstructions", () => {
  const GROUPS = [
    { title: "Sauce", steps: ["Concassez 4 tomates", "Laissez mijoter 20 minutes"] },
    { steps: ["Ajoutez 200 g de farine"] },
  ];

  test("rewrites every step and keeps the groups and their headings", () => {
    expect(scaleInstructions(GROUPS, LINES, 4, 2)).toEqual([
      { title: "Sauce", steps: ["Concassez 2 tomates", "Laissez mijoter 20 minutes"] },
      { steps: ["Ajoutez 100 g de farine"] },
    ]);
  });

  test("hands back the very same array at the servings it was written for", () => {
    expect(scaleInstructions(GROUPS, LINES, 4, 4)).toBe(GROUPS);
  });
});
