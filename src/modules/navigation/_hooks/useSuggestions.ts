import { UNITS } from "@shared/ingredients";

const DEFAULT_UNIT = "pcs";
const DEFAULT_AMOUNT = 1;

export type Unit = (typeof UNITS)[number];

// 500g / 500 g / 1,5kg / 2 / fractions like 1/2
const QUANTITY_RE = new RegExp(
  `^(\\d+(?:[.,]\\d+)?(?:/\\d+)?)\\s*(${UNITS.join("|")})?$`,
  "i"
);

const isUnit = (word?: string): word is (typeof UNITS)[number] =>
  !!word && (UNITS as readonly string[]).includes(word);

const normalize = (word: string) => {
  const clean = word.replace(/[.,\/#!$%^&*;:{}=\-_`~()]/g, "");
  return clean.endsWith("s") ? clean.slice(0, -1) : clean;
};

const FAKE_SUGGESTIONS = [
  { id: "tomatoes", name: "Tomates", emoji: "🍅" },
  { id: "cherry-tomatoes", name: "Tomates cerises", emoji: "🍅" },
  { id: "tomato-sauce", name: "Sauce tomate", emoji: "🍶" },
  { id: "tomato-soup", name: "Soupe de tomates", emoji: "🥣" },
]

const toTokens = (text: string) => {
  const splittedText = text.trim().toLowerCase().split(" ");
  return splittedText.map((word) => {
    // Remove any punctuation from the word
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    // Remove the plural form of the word if it ends with 's'
    const singularWord = cleanWord.endsWith("s") ? cleanWord.slice(0, -1) : cleanWord;
    return singularWord;
  })
    // Remove filler words that are too short to be meaningful
    .filter((w) => w.length > 2 || !Number.isNaN(Number(w)));
}

const parseQuantity = (tokens: string[]): { amount: string | null, unit: Unit | null } => {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const match = QUANTITY_RE.exec(token);
    if (!match) continue;

    const [, rawAmount, matchedUnit] = match;
    if (matchedUnit) return { amount: rawAmount!, unit: matchedUnit as Unit };

    const next = tokens[i + 1];
    if (isUnit(next)) return { amount: rawAmount!, unit: next };

    return { amount: rawAmount!, unit: DEFAULT_UNIT };
  }
  return { amount: null, unit: null };
};

const toWords = (tokens: string[]) =>
  tokens.filter((t) => !QUANTITY_RE.test(t) && !isUnit(t)).map(normalize).filter(Boolean);

export const useSuggestions = (text: string) => {
  const tokens = toTokens(text);
  const { amount, unit } = parseQuantity(tokens);
  const words = toWords(tokens);

  const suggestions = FAKE_SUGGESTIONS.filter((s) =>
    words.some((w) => s.name.toLowerCase().includes(w))
  ).sort(
    (a, b) =>
      words.filter((w) => b.name.toLowerCase().includes(w)).length -
      words.filter((w) => a.name.toLowerCase().includes(w)).length
  );

  return {
    amount: Number(amount ?? DEFAULT_AMOUNT),
    unit: unit || DEFAULT_UNIT,
    suggestions,
    hasSuggestions: suggestions.length > 0
  };
};
