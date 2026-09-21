/**
 * Whether a recipe's title (or URL slug) names the dish that was searched for.
 *
 * Needed because a site's search is fuzzy and ranks by popularity: on Marmiton, "mafé" returns
 * "Madeleines au miel" with 635 reviews and "poulet yassa" returns "Poulet Massala", and keeping the
 * most reviewed card would import the wrong dish. Source-agnostic: a Marmiton title and a BBC Good
 * Food slug (`vegan-shepherds-pie`) go through the same words.
 *
 * Tuned for precision. A false match imports the wrong dish under this dish's name; a missed match
 * costs one dish, and the agent proposes more.
 */

/** Words that carry no dish identity, French and English. Compared after `_wordsOf` normalization. */
const FILLER_WORDS = new Set([
  "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les", "un", "une",
  "facon", "maison", "recette",
  "and", "of", "s", "the", "with",
]);

/** The shortest word allowed one typo: "gaspacho" for "gazpacho", never "riz" for "ris". */
const FUZZY_MIN_LENGTH = 5;

/**
 * A text's words, lowercased, without accents or ligatures, singular, filler removed.
 *
 * Singular by dropping one trailing "s" or "x" from words over 3 letters, which is wrong for some
 * words ("ananas") but wrong the same way on both sides, so they still compare equal.
 */
const _wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER_WORDS.has(word))
    .map((word) => (word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word));

/** Whether `a` becomes `b` with at most one insertion, deletion or substitution. */
const _withinOneEdit = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }

  return edits + (a.length - i) + (b.length - j) <= 1;
};

const _sameWord = (dishWord: string, titleWord: string): boolean =>
  dishWord === titleWord || (dishWord.length >= FUZZY_MIN_LENGTH && _withinOneEdit(dishWord, titleWord));

/**
 * Whether `title` names `dish`: every significant word of the dish appears in the title, in any
 * order, one typo allowed for words of 5 letters or more. The title may say more ("Boeuf
 * bourguignon rapide" names "boeuf bourguignon"). A dish with no significant word matches nothing.
 */
export const matchesDish = (title: string, dish: string): boolean => {
  const dishWords = _wordsOf(dish);
  const titleWords = _wordsOf(title);

  return (
    dishWords.length > 0 &&
    dishWords.every((dishWord) => titleWords.some((titleWord) => _sameWord(dishWord, titleWord)))
  );
};
