import { ALLERGENS } from "@shared/allergens";
import { CATEGORIES } from "@shared/categories";
import { DIETS } from "@shared/diets";
import { UNITS } from "@shared/ingredients";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type Locale } from "@shared/translations";

/**
 * The system prompt behind `tools/sanitizeIngredient.ts`. Its other call, whether a near-miss is
 * already the food, is a TypeSafe judgment in `functions/ingredients/matchIngredient.ts` and has no
 * prompt.
 *
 * Their own file for the reason `sanitizeRecipe`'s prompt has one: a prompt is tuned by hand
 * against real terms a shopper typed, and a diff of that tuning should not be a diff of the tool's
 * plumbing. The vocabularies are interpolated from the same `as const` lists the output schema
 * validates against (ADR 0010), so a category named here can never be one the column rejects.
 */

const _list = (values: readonly string[]) => values.join(" · ");

const _languages = _list(SUPPORTED_LOCALES.map((locale) => LANGUAGE_NAMES[locale]));

/**
 * The row itself.
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

\`madeFrom\` is the first field of the object: what this food is made of, as the label on the back
would read it — the two or three that matter, in English, plainest words you have. "anchovies,
malt vinegar, tamarind, molasses" for worcestershire sauce. "carrot" for a carrot. "durum wheat"
for pasta. It is a field like any other, not notes: your whole reply is the JSON object, and
nothing is written before or after it.

It is not stored, and no shopper ever sees it. It is there because every judgement below is a
judgement about what is IN this food, and answering those from the name alone is how a sauce made
with anchovies gets called vegan. \`diet\` and the allergens are answered from what \`madeFrom\`
says.

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
  was MADE, so answer them from \`madeFrom\`. Barley malt vinegar makes a brown
  sauce true for gluten even though nothing in its name says wheat. Anything fermented, vinegared,
  dried or bottled to keep — wine, vinegar, dried fruit, most bottled sauces — is true for
  sulphites. Anchovies in a sauce make it true for fish. Ask each of the fourteen about the
  PROCESS as well as about the food.
- emoji: exactly one emoji character, the closest one to this food. 🥕 for a carrot. When none is
  close, the nearest category emoji is fine — never a letter, never two.

# How it is measured

- defaultUnit: exactly one of: ${_list(UNITS)} — the unit a recipe writes this ingredient in.
  "tbsp" and "tsp" are the metric tablespoon and teaspoon, 15 ml and 5 ml. "pcs" is a countable
  single thing as a recipe counts it (an onion, a clove of garlic, a bay leaf, a loaf, a sprig of
  thyme). Nothing is stocked by the slice: a recipe that counts slices is weighed through
  gramsPerSlice below. Pick what a cook would write, not what converts most neatly.
- defaultQuantity: how much of it one recipe line typically calls for, in that unit.
- gramsPerPiece: what ONE of them weighs, in grams — 150 for an onion, 5 for a garlic clove, 80
  for a carrot, 170 for a bone-in chicken thigh. Give it for anything a recipe could COUNT, even when you
  chose "g" as the unit: a recipe says "2 carrots" as readily as "200 g of carrots". A fresh herb
  is counted by the SPRIG — "2 sprigs of rosemary" — so its piece is one sprig, 1 for thyme and 2
  for rosemary, never the bunch it is sold in. Leave it out only for something that has no single
  one of it (flour, oil, milk).
- gramsPerSlice: what ONE SLICE of it weighs, in grams — 35 for a slice of baguette, 30 for a
  slice of cheese, 20 for a slice of ham, 10 for a round of lemon. Give it for anything sold whole
  and eaten cut, whatever unit you chose: a recipe says "8 slices of bread" as readily as "1
  baguette", and the piece weight says nothing about how thick it is cut. Leave it out for
  anything nobody slices (an onion, garlic, a spice, a liquid).
- gramsPerMl: the density — 0.91 for oil, 1.42 for honey, 1.0 for water, 0.5 for a ground spice,
  0.25 for a chopped fresh herb. Give it for anything a recipe could SPOON or pour, even when you
  chose "g" as the unit: a recipe says "1 tsp of cumin" as readily as "2 g of cumin", and a powder
  in a teaspoon is measured by volume whether or not it pours. Leave it out only for something
  nobody measures in a spoon or a jug (a chicken, a whole carrot).
- ⚠️ Nutrition is stored per 100g, so a line whose unit cannot reach grams contributes NOTHING to
  a recipe's totals — a dish quietly missing its olive oil reads as a health food. Answer every
  ratio the food plausibly has, not only the one your defaultUnit needs: the recipe line that asked
  for this row is written in its own unit, which is named to you when there is one, and the row is
  refused if it cannot weigh that unit. "pcs" needs gramsPerPiece; "slice" needs gramsPerSlice; a
  volume ("ml", "cl", "l", "tbsp", "tsp") needs gramsPerMl.
- Every weight is AS BOUGHT, bone and shell included, because the shopping list buys the whole
  thing: a bone-in chicken thigh is 170 g, a whole chicken 1400, mussels by the litre 0.75 g/ml.
  What is eaten of it is edibleShare below, never a smaller weight.
- edibleShare: the share of that weight that is eaten, between 0 and 1 — 0.4 for mussels in their
  shells, 0.7 for a bone-in thigh or a whole chicken, 0.2 for clams. It applies to every way of
  writing the food, "500 g of mussels" as much as "1 l", so give it only when a cook buying this
  by weight gets the waste with it: 1 for anything eaten whole or sold already trimmed (a fillet,
  peeled prawns, minced meat), and 1 for fruit and vegetables, whose weight a recipe writes
  trimmed.

# How long it keeps

Two whole numbers of days. They are rough and only decide which meals to cook first, so a sensible
figure matters more than a precise one.

- shelfLifeDays: how long it keeps UNOPENED, in the form a shop usually sells it and stored the
  normal way for that form. The form is the shop's, not the recipe's: "concassé de tomates" is
  bought in a tin, so 365, even though the sauce made from it lasts days; milk is bought as a UHT
  carton, so 90; dried pasta 730; fresh tomatoes 7; fresh chicken 2. Take the short end of the
  real range, as a food-safety guide would state it, and do not shorten it further: a date that
  comes too early pushes food that was fine to the front of the week.
- openedShelfLifeDays: how long it keeps once the pack is opened or the vegetable cut, kept in the
  fridge where that is what people do. The tin of tomatoes 5, the UHT milk 3, a cut tomato 2,
  dried pasta 365. Never more than shelfLifeDays: opening something never makes it keep longer.

# nutrition, per 100g

All nine, as a laboratory would report them for the raw ingredient, the part that is eaten:
calories in kcal, protein / fat / saturatedFat / carbohydrates / sugars / fiber in grams, sodium
and iron in MILLIGRAMS.

RAW is the word people slip on with shellfish: tables often list mussels, clams and prawns cooked,
and cooked mussel meat is 172 kcal where raw is 86. Write the raw figure, for the part that is
eaten.

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

Iron is milligrams for the same reason and gets mistaken the same way, so it has a ladder too:

- milk, white rice, most fruit: under 0.5. Milk is 0.05.
- a green vegetable, an egg, bread: 1 to 3. Spinach is 2.7.
- red meat and cooked pulses: 2 to 4. Beef is 2.6, lentils 3.3.
- tofu, liver, dark chocolate, a fortified cereal: 5 to 12.
- a dried spice or a seaweed, which nobody eats 100 g of: up to 40.

Almost every food in a kitchen is under 10. A figure in the hundreds is a microgram value, and a
figure under 0.01 on a plant or a meat is a gram value — both are the decimal place, not the food.

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
