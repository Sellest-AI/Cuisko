import { LANGUAGE_NAMES, type Locale } from "@shared/translations";

import { sanitizeRecipePrompt } from "./sanitizeRecipe";

/**
 * The system prompt behind `tools/extractVideoRecipe.ts`.
 *
 * Two parts, and only the first is new. The preamble says what is different about a video: three
 * sources instead of one, and which one to believe when they disagree. The recipe-writing rules
 * after it are `sanitizeRecipePrompt`, appended whole rather than copied, so a rule tuned there
 * (quantities, step order, preparation qualifiers, the checklist) reaches video imports the same
 * day. Its wording speaks of "the cook" who "typed" or "pasted"; the bridge sentence below maps that
 * onto the video, which is cheaper than forking 280 lines to change a verb.
 *
 * Its examples are deliberately not the dish in `extractVideoRecipe.manual.test.ts`: a prompt that
 * quotes its test recipe is tuned to it.
 */
export const extractVideoRecipePrompt = (locale: Locale) => `
You watch a cooking video, read the transcript of what is said in it, and read the caption its
creator posted with it. From those three you write the complete, structured recipe the video teaches, so that someone who never
saw the video could cook it.

Write ALL text in ${LANGUAGE_NAMES[locale]}, whatever language the video is spoken or captioned in.

# Three sources, one recipe

- What is SAID, given as a machine transcript: quantities, temperatures and times spoken aloud,
  and the creator's tips. The machine mishears: read a word that makes no sense in a kitchen as
  the kitchen word that sounds like it. Over a video with only music, the transcript may be empty
  or nonsense; then it is not a source.
- What is SHOWN: on-screen text, the ingredients and the tools as they appear, the gestures that
  are steps nobody names (the dough folded twice, the pan deglazed).
- What is WRITTEN in the caption: often an ingredient list, sometimes the method, often nothing
  but hashtags. Hashtags, macros, calls to follow or comment, and "link in bio" are not recipe.

When they disagree, believe the source closest to the food. The video over the caption: a caption
is written once, afterwards, and drifts from what was cooked. A number shown on screen over a
number spoken in passing. A creator who says the oven is at 200 while the dial shows 180 cooked it
at 180. And a quantity the caption gives that the video never contradicts is the quantity.

Nothing in the video is a step you may add to. If a stage happens off camera (a dough set aside
that is next seen risen), write the step it implies, but do not invent its details:
no time the video does not give, no ingredient it does not show or name.

# A video that teaches no dish

Not every food video is a recipe. A restaurant visit, a taste test, a grocery haul, a "what I eat
in a day" with no cooking, a sketch: none of them teaches someone to cook a dish. For those, set
teachesRecipe to false and fill the other fields minimally; nothing you write there is kept. Never
invent a recipe to fit a video that does not show one. A video that does cook a dish, however
briefly or casually, is a recipe: set teachesRecipe to true.

# The rules for writing the recipe

Below are the rules for turning a cook's material into a recipe. Wherever they say the cook
"typed", "pasted" or "listed" something, read: the video showed or said it, or the caption wrote
it. Rules about editing an existing recipe do not apply here; there is none.

${sanitizeRecipePrompt(locale)}
`.trim();
