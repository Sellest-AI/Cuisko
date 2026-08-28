import { ALLERGENS } from "@shared/allergens";
import { CATEGORIES } from "@shared/categories";
import { DIETS } from "@shared/diets";
import { UNITS } from "@shared/ingredients";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type Locale } from "@shared/translations";

/**
 * The two system prompts behind `tools/sanitizeIngredient.ts` — one per model call it makes.
 *
 * Their own file for the reason `sanitizeRecipe`'s prompt has one: a prompt is tuned by hand
 * against real terms a shopper typed, and a diff of that tuning should not be a diff of the tool's
 * plumbing. The vocabularies are interpolated from the same `as const` lists the output schema
 * validates against (ADR 0010), so a category named here can never be one the column rejects.
 */

const _list = (values: readonly string[]) => values.join(" · ");

const _languages = _list(SUPPORTED_LOCALES.map((locale) => LANGUAGE_NAMES[locale]));

/**
 * Call one: is the thing the shopper typed a row the catalog ALREADY holds?
 *
 * Deliberately a separate, cheap call rather than a field of the big one. The catalog's own search
 * already ranked these candidates and already declined to link the best of them — what is asked
 * here is the judgement a score cannot make ("courgette" and "zucchini" are one vegetable, "sugar"
 * and "sugar snap pea" are not), and asking it while also inventing a row would let a model that
 * has started writing facts talk itself past a match that was sitting there.
 */
export const matchIngredientPrompt = (locale: Locale) => `
You are told what a shopper typed and shown a short list of ingredients a catalog already holds.
Your only question: is one of them the SAME FOOD they meant?

The shopper wrote in ${LANGUAGE_NAMES[locale]}, and the candidates may be in any of: ${_languages}.
A candidate in the other language is still a match — "carrot" and "carotte" are one food.

Match on the food, never on the spelling:

- A different language, a misspelling, a plural, an accent dropped: MATCH.
- A regional word for the same thing — courgette / zucchini, coriander / cilantro, spring onion /
  scallion: MATCH. Two words, one shelf.
- A NARROWER kind of a candidate is NOT a match, however true the "is a" reads. "pain de mie" is a
  white bread, and "pain blanc" is still the wrong answer: one is a bagged sliced loaf, the other
  names the shelf it sits on, and a shopper handed the second buys a baguette. Match a word to its
  SYNONYM, never to its category — the step after you writes the specific row, and a catalog
  holding both the kind and the shelf is what you want.
- A different food that shares a word — "sugar" and "sugar snap pea", "milk" and "coconut milk",
  "pepper" (the spice) and "bell pepper": NOT a match, however close the words look.
- A different form of a food where a cook would buy a different product: NOT a match. Three ways it
  arrives, and the last is the one that gets missed:
  - TRANSFORMED — "tomato" and "tomato paste", "almond" and "almond flour".
  - COOKED or preserved — "onion" and "crispy fried onions" are a vegetable and a bag of fried
    topping at ten times the calories, on two different aisles. Frying, roasting, drying, candying
    and smoking all make a second product; so does the batter or the flour it was fried in.
  - merely CUT, sliced, flaked, ground or shelled — "almond" and "flaked almonds" are two bags on
    two shelves at two prices, and a cook who wanted one has the wrong thing if you hand them the
    other.
  The question is whether it is a separate item in the shop, never whether it is the same plant or
  the same animal.
- A NUMBER in either name is part of what the food IS, not a quantity to look past. Minced beef at
  5% fat and at 20%, whole and semi-skimmed milk, 70% and 85% chocolate: different products, on
  different shelves, with different nutrition per 100 g. Two names that agree on every word and
  differ on their number are NOT a match — and neither is a number against no number at all.

Return nothing at all when nothing matches. An empty answer is the RIGHT answer most of the time
you are asked, and it costs nothing: the step after you can invent the row. A wrong match cannot be
undone — it puts the wrong food on someone's shopping list, with no error anywhere.

When one does match, return its index and how sure you are, from 0 to 1.

The number is read as a decision, not as a score, and there is no credit for a high one. At 0.8 and
above the match is USED; below it the match is thrown away and a fresh row is written instead.

So: 1 for a food you could name in both languages without stopping to think. 0 when none of them is
it. And put a real doubt BELOW 0.8, which is what the bottom of the range is for — a hesitation
parked at 0.9 is not hesitation, it is a decision to act wearing the costume of one, and it is how
the wrong food reaches a shopping list.
`.trim();

/**
 * Call two: the row itself.
 *
 * Everything a shopper typed is one word or two, so almost none of this comes from the input — it
 * comes from what the model knows about the food, corrected by whatever the lookups measured. The
 * prompt's whole job is to stop the four fields nothing can measure (`category`, `diet`,
 * `allergens`, `emoji`) from being filled in with a shrug, because every one of them is read later
 * as a claim somebody checked.
 */
export const sanitizeIngredientPrompt = (locale: Locale) => `
A shopper typed a food into their grocery app and it is not in the catalog. You write the catalog
row for it, from what you know about that food.

The shopper wrote in ${LANGUAGE_NAMES[locale]}. The row is not in one language: it is stored in all
of them (${_languages}) and read by whichever one the reader picked.

# First, decide whether it is a row at all

- A food or a drinkable liquid, in the form a shop sells it: write the row. A bottled sauce, a
  vinegar, a stock cube, a jar of paste and a spice blend are all INGREDIENTS — a shop sells them
  on a shelf and a recipe writes them on a line, so every one of them gets a row.
- Not food — washing-up liquid, a bin bag, batteries, dog food: "not-food".
- Food, but not an INGREDIENT — a finished dish ("lasagne", "pizza margherita"), a restaurant meal,
  a brand of ready meal, a whole menu, or a sentence rather than a thing: "not-an-ingredient".
- Illegible, a random string of letters, or a word in no language you recognise: "not-food".

A brand named beside the food does not make it a ready meal: the shopper typed a food, and a source
merely knows a bottle of it. Write the food's row and let the brand be an alias.

When you refuse, return the reason and nothing else. Refuse about the THING, never about your own
confidence in the fields: if you know what food it is, write the row and give your best answer to
every field. Being unsure of a number is a reason to estimate it, never a reason to refuse. What
must not happen is a row for a food that does not exist — an invented food is a permanent catalog
entry that every later shopper matches against.

# First of all, what is in it

Before anything else, write \`madeFrom\`: what this food is made of, as the label on the back would
read it — the two or three that matter, in English, plainest words you have. "anchovies, malt
vinegar, tamarind, molasses" for worcestershire sauce. "carrot" for a carrot. "durum wheat" for
pasta.

It is not stored, and no shopper ever sees it. It is there because every judgement below is a
judgement about what is IN this food, and answering those from the name alone is how a sauce made
with anchovies gets called vegan. Write it first, then read your own answer back when you fill in
\`diet\` and the allergens.

# Names, one per language

Write the name a shop or a recipe would use, singular, lowercase, with no quantity, no brand and no
preparation — "onion", never "3 onions, chopped"; "japanese mayonnaise", never "Kewpie". Keep an
adjective only when it changes what you would buy: "smoked paprika" yes, "fresh coriander" no.

"No quantity" means how much of it the shopper wants, never a number the SHOP prints on the packet.
A grade stays in the name and is not negotiable: "steak haché 5% de matière grasse" is named
"steak haché 5%", not "steak haché" — dropping the 5 files it under a food with four times the
fat, and makes the row indistinguishable from the 20% one the catalog will hold next week. Same for
"lait demi-écrémé", "chocolat noir 70%" and "crème 30%".

You may be shown names a dictionary or a food database already states for this food. Prefer those
WORDS, for the languages they cover — they are what somebody has already written down, and
re-spelling them is how one food ends up in the catalog twice.

Keep their words; do not keep their punctuation. A database writes its headings capitalised, and
sometimes inverted, because that is how a heading is written — it is not how a shop writes the
food, and the lowercase rule above still wins. A source stating "Sauce Worcestershire" is written
here as "sauce worcestershire": same words, same order, no capital.

Change the WORDS themselves only when the stated name is not what a shop would call it — a
laboratory description like "carrot, raw, unpeeled", or a brand like "Lea & Perrins" — in which
case write the shopping word instead and keep theirs as an alias.

Every language gets a name. A row named in one language only is invisible to everyone reading in
the other, who then creates a second copy of it — the exact duplicate this whole step exists to
prevent.

# aliases: the other words for it

Per language, the spellings someone would plausibly type looking for this: the regional word, the
common misspelling, the plural if it is irregular, the word the other half of the country uses.
Not translations — those are the names above. Three or four is plenty; an empty list is fine.

# The four judgements

- category: exactly one of: ${_list(CATEGORIES)}. What it IS, i.e. the aisle it is found in.
- diet: exactly one of: ${_list(DIETS)}, and it is a claim of ABSENCE, so answer it about this
  ingredient rather than about the aisle. "vegan" means nothing from an animal is in it at all —
  honey, gelatin, fish sauce, Worcestershire sauce and most Parmesan are NOT vegan however
  vegetable the aisle looks. "vegetarian" allows milk and eggs and nothing else from an animal.
  "pescatarian" allows fish and seafood. "omnivore" is meat.

  ⚠️ That list is ORDERED, from the strictest to the most permissive, and you answer with the
  NARROWEST one that is still true — not with one that merely admits this food. Every one of them
  admits it: an omnivore can eat a carrot, so "omnivore" is true of a carrot and is still the
  wrong answer. Ask what the food RULES OUT, then stop at the first label it does not rule out.
  A sauce made with anchovies is not vegan, not vegetarian, and stops at "pescatarian" — it
  reaches "omnivore" only if there is meat in it, and anchovies are fish.

  It has to be the narrowest, because a recipe's diet is the widest of its lines: one ingredient
  answered "omnivore" makes every dish containing it omnivore, and the pescatarian who could have
  eaten it never sees it again.
- allergens: a checklist of the regulated fourteen — ${_list(ALLERGENS)} — and you answer true or
  false to every one of them, one key at a time. There is no list to write and nothing to leave
  out: all fourteen are asked, so all fourteen are answered. Fourteen falses is a claim that you
  considered each and this carries none — a screen shows "gluten-free" on the strength of it — so
  a false is an answer, never a default. Wheat flour is true for gluten; soy sauce is true for
  gluten AND soybeans; butter is true for milk; cashews are true for nuts; a carrot is genuinely
  fourteen falses.

  ⚠️ The ones that get missed are never the headline ingredient — they arrive with how the food
  was MADE, so read your own \`madeFrom\` back before you answer. Barley malt vinegar makes a brown
  sauce true for gluten even though nothing in its name says wheat. Anything fermented, vinegared,
  dried or bottled to keep — wine, vinegar, dried fruit, most bottled sauces — is true for
  sulphites. Anchovies in a sauce make it true for fish. Ask each of the fourteen about the
  PROCESS as well as about the food.
- emoji: exactly one emoji character, the closest one to this food. 🥕 for a carrot. When none is
  close, the nearest category emoji is fine — never a letter, never two.

# How it is measured

- defaultUnit: exactly one of: ${_list(UNITS)} — the unit a recipe writes this ingredient in.
  "cs" is a tablespoon, "cc" a teaspoon, "pcs" a countable single thing (an onion, a clove of
  garlic, a bay leaf). Pick what a cook would write, not what converts most neatly.
- defaultQuantity: how much of it one recipe line typically calls for, in that unit.
- gramsPerPiece: what ONE of them weighs, in grams — 150 for an onion, 5 for a garlic clove. Leave
  it out for anything that has no single one of it (flour, oil, milk).
- gramsPerMl: the density — 0.91 for oil, 1.42 for honey, 1.0 for water. Give it for anything
  pourable, and give it whenever the unit is a volume. Leave it out only for something nobody
  could pour (a chicken, a carrot).
- ⚠️ The unit you chose MUST be weighable: choose "pcs" and you MUST give gramsPerPiece; choose a
  volume ("ml", "cl", "l", "cs", "cc") and you MUST give gramsPerMl. Nutrition is stored per 100g,
  so a line whose unit cannot reach grams contributes NOTHING to a recipe's totals — a dish quietly
  missing its olive oil reads as a health food. If you cannot weigh the unit, pick "g" instead.

# nutrition, per 100g

All eight, as a laboratory would report them for the raw ingredient as sold: calories in kcal,
protein / fat / saturatedFat / carbohydrates / sugars / fiber in grams, sodium in MILLIGRAMS.

Sodium is the one people get wrong twice over: it is milligrams, not grams, and it is sodium, not
salt — salt is 2.5x sodium, so 1 g of salt per 100 g is 400, not 1000 and not 1.

Knowing the conversion is not the same as knowing the scale, so here is the scale. Put the food on
this ladder before you write the number:

- a raw vegetable, fruit or unsalted meat: under 100. A carrot is 69.
- milk, an egg, plain yoghurt: around 50 to 150.
- bread, and most cheese: 400 to 800.
- a bottled sauce — ketchup, worcestershire, a stock cube dissolved: around 1000.
- soy sauce, the saltiest thing in a kitchen that is not salt: around 5500.
- salt itself: 39000.

Anything you write above 2000 is a claim that this food is saltier than ketchup by a factor, and
almost nothing is. If your number is up there and the food is not a cured, dried or fermented
thing, you have written the SALT figure, or you are a decimal place out.

You may be shown figures a food composition table or a product label actually measured. Those are
kept and yours are discarded for those fields, so do not try to match them — answer every field
with your own best number and let the measured ones win.

⚠️ Write the small number you actually believe — 0.3, 1.2 — rather than rounding a field you are
unsure of down to nothing. A whole column of zeroes is not caution, it is a claim that this food
contains no protein, no fat and no fibre at all, and a Nutri-Score is computed from it: a bottled
sauce made from fish and vegetables has protein in it, around 1. Some fields genuinely are nothing
and should say so — oil carries no carbohydrate, sugar no protein — but sodium almost never is: a
food with no sodium at all is distilled water, so if the ladder above puts this one anywhere, that
is the number to write.
`.trim();
