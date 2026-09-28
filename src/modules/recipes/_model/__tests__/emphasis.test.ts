import { describe, expect, test } from "vitest";

import type { RecipeLine } from "../detail";
import { type EmphasisSegment, emphasizeInstruction } from "../emphasis";

const line = (name: string, unit: RecipeLine["unit"] = "g"): RecipeLine => ({
  name,
  unit,
  quantity: 100,
  category: "VEGETABLE",
  emoji: "🥕",
  conversion: { defaultUnit: "g", gramsPerPiece: 150 },
});

const LINES: RecipeLine[] = [
  line("Tomates", "pcs"),
  line("Oignon", "pcs"),
  line("Farine"),
  line("Huile d'olive", "ml"),
  line("Pommes de terre", "pcs"),
];

/** Only the emphasised words, in order: what a cook's eye lands on. */
const strong = (instruction: string, lines = LINES) =>
  emphasizeInstruction(instruction, lines)
    .filter((segment) => segment.kind === "text" && segment.strong)
    .map((segment) => (segment as { text: string }).text);

/** The step as a reader sees it, with each picture drawn as `[Name]` where it goes. */
const drawn = (instruction: string, lines = LINES) =>
  emphasizeInstruction(instruction, lines)
    .map((segment: EmphasisSegment) => (segment.kind === "text" ? segment.text : `[${segment.line.name}]`))
    .join("");

describe("emphasizeInstruction", () => {
  /** Drawing the segments may change how the step looks, never what it says. */
  test("reproduces the instruction exactly when its segments are joined", () => {
    const text = "Faites revenir 2 oignons 10 minutes à 180°C, puis ajoutez 200 g de farine.";
    expect(
      emphasizeInstruction(text, LINES)
        .map((segment) => (segment.kind === "text" ? segment.text : ""))
        .join(""),
    ).toBe(text);
  });

  /** The quantity stands out; the ingredient's name reads as the rest of the sentence. */
  test("emphasises an amount with its measure, never the ingredient's name", () => {
    expect(strong("Ajoutez 200 g de farine.")).toEqual(["200 g"]);
    expect(strong("Concassez 4 tomates, puis réservez.")).toEqual(["4"]);
    expect(strong("Versez 3 cl d'huile d'olive")).toEqual(["3 cl"]);
    expect(strong("Ajoutez 2 cs de jus de citron", [line("Citron", "pcs")])).toEqual(["2 cs"]);
  });

  test("places an ingredient's picture just before the amount tied to it", () => {
    expect(drawn("Ajoutez 200 g de farine.")).toBe("Ajoutez [Farine]200 g de farine.");
    expect(drawn("Concassez 4 tomates, puis 2 oignons")).toBe(
      "Concassez [Tomates]4 tomates, puis [Oignon]2 oignons",
    );
    expect(drawn("4 pommes de terre nouvelles")).toBe("[Pommes de terre]4 pommes de terre nouvelles");
    expect(drawn("Versez 3 cl d'huile d'olive")).toBe("Versez [Huile d'olive]3 cl d'huile d'olive");
  });

  /** Nothing to label: the amount scales and is bold, but no line is what it counts. */
  test("draws no picture for an amount whose words name no line", () => {
    expect(drawn("Ajoutez 2 cs de jus de citron", [line("Citron", "pcs")])).toBe(
      "Ajoutez 2 cs de jus de citron",
    );
    expect(drawn("Laissez reposer 10 minutes.")).toBe("Laissez reposer 10 minutes.");
  });

  test("keeps the bold on the amount when a picture precedes it", () => {
    expect(emphasizeInstruction("Concassez 4 tomates", LINES)).toEqual([
      { kind: "text", text: "Concassez ", strong: false },
      { kind: "ingredient", line: LINES[0] },
      { kind: "text", text: "4", strong: true },
      { kind: "text", text: " tomates", strong: false },
    ]);
  });

  test("emphasises durations, spelled with digits or words, in both languages", () => {
    expect(strong("Laissez mijoter 20 minutes.")).toEqual(["20 minutes"]);
    expect(strong("Faites cuire 10 min puis 2 h au repos")).toEqual(["10 min", "2 h"]);
    expect(strong("Laissez reposer une heure.")).toEqual(["une heure"]);
    expect(strong("Bake for 25 mins, then rest for an hour.")).toEqual(["25 mins", "an hour"]);
    expect(strong("Laissez lever une demi-heure")).toEqual(["une demi-heure"]);
    expect(strong("Marinez 1 heure et demie")).toEqual(["1 heure et demie"]);
    expect(strong("Faites dorer quelques minutes")).toEqual(["quelques minutes"]);
  });

  /** A range is one duration; bolding its ends apart reads as two instructions. */
  test("emphasises a range of time as one run", () => {
    expect(strong("Laissez colorer 8 à 10 minutes.")).toEqual(["8 à 10 minutes"]);
    expect(strong("Simmer 10-15 minutes")).toEqual(["10-15 minutes"]);
  });

  test("reads hours and minutes written together as one duration", () => {
    expect(strong("Enfournez pour 1h30.")).toEqual(["1h30"]);
    expect(strong("Enfournez pour 1 h 30 min.")).toEqual(["1 h 30 min"]);
  });

  /** The trailing-minutes form is the only place a bare number after a duration is taken. */
  test("does not swallow the next number after a duration", () => {
    expect(strong("Mélangez 5 minutes 2 fois")).toEqual(["5 minutes"]);
  });

  test("leaves temperatures, labels and prose numbers alone", () => {
    expect(strong("Préchauffez le four à 180°C, thermostat 6.")).toEqual([]);
    expect(strong("Coupez en 2 dans la longueur.")).toEqual([]);
  });

  /** A unit is a whole word: "2 s" is two seconds, "2 sucres" is not a duration. */
  test("does not read a unit out of the start of a longer word", () => {
    expect(strong("Ajoutez 2 sucres")).toEqual([]);
    expect(strong("Coupez les prunes")).toEqual([]);
  });

  test("returns the instruction as one plain segment when nothing stands out", () => {
    expect(emphasizeInstruction("Servez chaud.", LINES)).toEqual([
      { kind: "text", text: "Servez chaud.", strong: false },
    ]);
  });

  test("returns nothing for an empty instruction", () => {
    expect(emphasizeInstruction("", LINES)).toEqual([]);
  });
});
