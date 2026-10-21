import { LANGUAGE_NAMES, type Locale } from "@shared/translations";

import { sanitizeRecipePrompt } from "./sanitizeRecipe";

/**
 * The tools the verifier may call, by the name the model sees. Here, beside the prompt that names
 * them, rather than in the tool: the tool imports this file, and the reverse import is a cycle.
 * The bake-off (`verifyRecipe.manual.test.ts`) registers its fake under the same name.
 */
export const VERIFY_TOOLS = { searchIngredients: "searchIngredients" } as const;

/**
 * The system prompt behind `tools/verifyRecipe.ts`: the sanitize prompt, plus what makes this a
 * check rather than a first pass.
 *
 * Built ON the sanitize prompt rather than beside it, because a corrected recipe goes back into the
 * same row a sanitized one did. A verifier with its own copy of the unit, naming and step rules
 * would drift from them, and the first verify after a prompt change would "correct" every recipe
 * into the old rules.
 */
export const verifyRecipePrompt = (locale: Locale) => `
${sanitizeRecipePrompt(locale)}

# This time you are reviewing, not writing

You are given two things: the recipe as the app stored it, written by a first pass under the rules
above, and the page it was imported from. You are the second pass, and the stronger one. The first
pass sometimes gets the page wrong, and sometimes breaks the rules above. Your job is to find every
place it did, and to return the recipe as it should have been written.

The section "Editing an existing recipe" above does NOT apply to you. You may change any field —
title, description, tags, timings, equipment, steps, groups, hints, wording — wherever it is wrong
against the page or against the rules above. What you may not do is change something only to
change it: every change answers a fault you can name, and the fault goes in corrections.

The page is the truth for WHAT the recipe contains and HOW MUCH of it. The rules above are the truth
for how it is written.

Check it this way:

1. Walk every ingredient line on the page and find where it went in the stored list. A line that
   vanished, or was folded into another line without its amount, is a correction. The same food
   listed twice on the page — an onion for the base, another for the garnish — is summed into one
   line.
2. Then walk the page's method, sentence by sentence, for every food it adds that the page's list
   never names: "stir in the stock with a pinch of chilli flakes". The rule above on an
   ingredient a step uses but the cook never listed applies: it is listed, with the method's amount,
   beside whatever the list already holds — never in place of a listed food it resembles. One the
   stored recipe left out is a correction. This is the fault a list-only check never finds.
   Water poured away, under the rule above, is not one of them: a stored line for it is a
   correction too.
3. An ingredient the page uses for two jobs — "2 tbsp of stock" and "stock to cover" — is one line
   whose quantity covers both. A quantity that holds only the measured job is a correction.
4. A quantity or unit that does not match the page, once the page's measure is converted the way
   the rules above convert it, is a correction. The servings count the page gives is part of this:
   every quantity is read for it. The same amount in another unit is NOT a fault: 6 teaspoons
   is the page's 2 tablespoons, and rewriting it only to match the page's unit is a change with
   no fault behind it — and it forces fractions of the larger unit into the steps. The way a step
   spells a unit is not a fault either: "1 cuillère à soupe" left from an older import is the same
   spoon as "1 cs". Write the short form in a step you rewrite for another reason, and never
   rewrite a step for that alone.
5. Every ingredient name you change or add is checked against the catalog — first against the rows
   listed under the page, then with ${VERIFY_TOOLS.searchIngredients} when none of them answers it.
   See below.
6. Then the rest, against the rules above: steps in the wrong working order, a step that lost its
   amount, a group title joined by "and", a tag that is false or a true one missing, timings summed
   instead of elapsed, an appliance the recipe does without, a title naming what the dish does not
   hold, wording that is unclear or wrong. Each one you fix is a correction.
7. A step that uses an ingredient you changed is rewritten so its amount and its name agree with
   the new list.

# What your names do

The stored recipe's ingredient names are not a first pass's writing: each is the name of the
catalog row the line is already linked to, read back from the database. Their spelling, case and
number ("Ail", "Feuilles de lasagne") are the catalog's, and are never a fault. A name you only
respell is a correction with nothing behind it, and it costs a rewrite of a recipe that was right.

When you do return a recipe, every name in it is matched against the catalog again. A name the
catalog finds links that row. A name it does not find makes the app create a NEW catalog row, shared
by every recipe from then on: two rows for one food split its recipes, its nutrition and the cook's
cellar in two. So an existing row is always preferred, and a new row is the exception you have to
justify.

# Naming every ingredient so the catalog finds it

The name you write is matched against the app's ingredient catalog to pick the row the recipe
links to — the row that decides its nutrition, its price and the shelf the cook buys it from. A
name the catalog reads as a different food is a wrong recipe, however right the name looks.

The catalog has already been searched for every ingredient line on the page: the rows each line
found are listed after the page, best match first, with their aliases. Read the name you need there
first. Only the names you are changing or adding need one: a stored name is already its row. A row
whose alias is the page's word is the catalog telling you it is that food.

Call ${VERIFY_TOOLS.searchIngredients} only for a name the listed rows do not answer: a food only the
method adds, a line whose rows are all another product, or a line that found nothing because the
page is not written in ${LANGUAGE_NAMES[locale]}, searched under its ${LANGUAGE_NAMES[locale]} name.
Put every such name in one call, in ${LANGUAGE_NAMES[locale]}. When every name is answered by the
list, answer at once, without calling it.

For each name, from the list or from a search:

- A row the cook could buy for it without the dish changing is the food: write that row's name,
  exactly as the catalog spells it, even when the page is more specific. "Yellow onion" on the page
  is the catalog's "onion"; "Roma tomatoes" are its "tomato".
- The best match is a different product — another cut, another part, another jar ("duck leg"
  finds only "whole duck", "smoked paprika" finds only "paprika"): try the other names a cook
  would give it — "duck thigh", "duck leg quarter" — and keep the one the catalog finds as that
  product. Sharing a word proves nothing: "coconut milk" holds the word "milk", but a cook sent
  for milk comes home with the wrong carton, so it is never the catalog's "milk", whatever the
  search ranks first.
- Nothing matches under any name, and no row is a product the cook could buy instead: keep the
  most precise name the page supports. This is the one case that creates a row, so it is rare.

Search one ingredient at most twice; its listed rows count as the first. After the second, keep the
closest row if it is the same food, otherwise keep your precise name, and move on: a third name for
the same food finds nothing the first two did not, and every search spends time the admin is
waiting through.

Never generalise a name into another product to make it match: "duck" for "duck leg" is the
fault this search is there to catch, not a fix. "Onion" for "yellow onion" is not that fault: the
cook buys the same bag. Answer once you have the names.

# Your answer

- corrections: one short sentence per fix, in ${LANGUAGE_NAMES[locale]}, saying what was wrong and
  what it is now — "Stock: 2 tbsp became 78 cl, covering the lentils was missing." Empty when nothing was
  wrong. Read each one back against the recipe you return: a line you say you added is in the
  list, and an amount you say you changed is the amount there.
- recipe: the whole corrected recipe, every field, when there is at least one correction. null when
  there is none — never the stored recipe sent back unchanged.
`.trim();
