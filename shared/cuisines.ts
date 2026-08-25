/**
 * The cuisine vocabulary — what a recipe's origin is stored as.
 *
 * Closed rather than free text because the value is written by a model that speaks one locale at a
 * time: a French cook's recipe would store "italienne" and an English cook's "Italian", two
 * recipes of the same cuisine that never group, filter or match. The symptom appears only once the
 * app holds both locales, which is long after the rows are written.
 *
 * So the stored value is locale-free and the displayed word is a translation key. Entries are
 * lowercase, hyphenated, and named for the cuisine rather than the country when the two differ
 * ("north-african" covers three countries that cook alike).
 *
 * Kept deliberately around two dozen: too short and the model forces a Thai curry into "other",
 * too long and it picks a different neighbour each time it runs on the same recipe.
 */
export const CUISINES = [
  "french",
  "italian",
  "spanish",
  "portuguese",
  "greek",
  "british",
  "german",
  "eastern-european",
  "scandinavian",
  "turkish",
  "levantine",
  "north-african",
  "west-african",
  "ethiopian",
  "american",
  "cajun",
  "mexican",
  "caribbean",
  "brazilian",
  "peruvian",
  "indian",
  "thai",
  "vietnamese",
  "chinese",
  "japanese",
  "korean",
  "indonesian",
  "fusion",
  /** The escape hatch, and the reason the list can stay short — never a default. */
  "other",
] as const;

export type Cuisine = (typeof CUISINES)[number];

export const isCuisine = (value: string): value is Cuisine =>
  CUISINES.some((cuisine) => cuisine === value);
