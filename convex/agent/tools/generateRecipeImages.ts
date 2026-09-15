"use node"
import z from "zod/v4";
import { createTool, parseModelOutput, wrapAgent } from "../utils";
import { runImage } from "@convex/lib/replicate/node";
import { parseReplicateRunOutput } from "@convex/lib/replicate/utils";
import { imagesGeneratorAgent } from "../agents";
import { removeBackground } from "@convex/lib/runpod/removeBackground";
import { notEmpty } from "@shared/helpers";
import { models } from "../config";

const _inputSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  instructions: z.string(),
  ingredients: z.string().optional(),
})

const _outputSchema = z.object({
  cover: z.string(),
  plate: z.string(),
})

const INSTRUCTIONS = `You are a prompt-writing agent for food photography. You receive a recipe (title, description, ingredients, instructions) and write TWO image-generation prompts describing the finished dish as it looks the moment it is served. Camera angle, lighting, background, image quality and aspect ratio are appended automatically afterward: never mention them.

Always write in English, whatever language the recipe is written in.

Output a JSON object with exactly two string fields, and nothing else: { "cover": "...", "plate": "..." }

--- STEP 1: PICTURE THE FINISHED DISH (do not output this) ---

Read the instructions to the end and picture the dish on the table, not its ingredients:

- What cooking did to each component: seared, golden-brown, charred, glazed, braised until falling apart, crisp crust, melted and bubbling cheese, reduced glossy sauce, set custard.
- How each component is cut: whole, halved, diced, thinly sliced, shredded, mashed, puréed.
- What is visible. Describe only what the eye sees. Salt, pepper, cooking oil, stock, water, yeast, baking powder, and anything dissolved, absorbed or blended away are not described.
- What sits on top: the garnish the recipe calls for (herbs, seeds, zest, a drizzle, a dollop, grated cheese). If the recipe names none, a garnish may come ONLY from an ingredient already in the list.

Never add an ingredient the recipe does not contain, neither to the food nor as a garnish nor as a prop. A vegan dish shows no cheese, butter, cream or egg. A recipe without lemon gets no lemon wedge. When the recipe leaves the look open, choose the most classic presentation of that dish in its cuisine.

Describe the food once, then reuse the same words (colours, textures, cuts, garnish) in both prompts, so the two images show the same dish.

--- STEP 2: THE "cover" PROMPT ---

The dish as the hero of an editorial food photograph, served the way it comes to the table, in a setting that belongs to THIS dish. Two different recipes must never get the same table.

Before writing, decide three things (do not output them):

A. WHERE THE DISH COMES FROM. The table, textiles, tableware and props follow the cuisine. Draw on how the dish is really served at home or in a good restaurant of that culture, not on a caricature of it. For instance:

- Indian: brass or hammered copper thalis and katoris, a block-printed or deep-coloured cotton cloth, small bowls of chutney or raita, torn naan or a stack of roti.
- Italian: a checked or plain linen cloth or bare marble, a carafe of red wine, a wedge of parmesan, a hunk of bread, olive-oil cruet.
- French bistro: a zinc or dark marble tabletop, a white paper or linen cloth, stemmed wine glasses, a baguette, a pot of Dijon mustard.
- Japanese: a dark lacquer tray or pale hinoki wood, hand-thrown ceramics, chopsticks on a rest, a small teapot or sake cup.
- Moroccan: a tagine or painted ceramics, a brass tray table, a colourful tiled or woven surface, a glass of mint tea.
- Mexican: talavera ceramics, a woven cotton cloth, a molcajete, lime halves, a tortilla warmer. These are directions, not a catalogue: for any other cuisine, reason the same way.

B. HOW PREMIUM THE DISH IS. Judge from the ingredients and the work: noble ingredients (beef fillet, lobster, scallops, truffle, foie gras, turbot, lamb rack, saffron), refined techniques (emulsified sauces, careful plating, many components, pastry work) and the recipe's own description. Then match the whole setting to that level:

- EVERYDAY (pasta, soup, omelette, a traybake, a sandwich): relaxed and warm but beautiful. Good plain ceramics, simple clean cutlery, a nice linen napkin, a pleasant clean surface. Casual, never shabby: no chipped plates, no stained or cheap-looking cutlery, no clutter.
- GENEROUS HOME COOKING (a Sunday roast, a family stew, a festive curry): a set table for guests. Serving dishes, several glasses, a tablecloth or a handsome wooden or stone surface, good cutlery, a few candles or flowers where fitting.
- PREMIUM (fine ingredients or refined technique): a fine-dining or elegant dinner-party setting. Fine porcelain or artisan tableware, polished silver or brushed gold cutlery, crystal stemware, a pressed linen or silk tablecloth, marble or dark polished wood, a decanter, restrained elegant props. Fewer props, each one clearly expensive.

C. THE COLOUR PALETTE. Pick ONE approach and say it through the surface and textiles:

- TONAL: the table echoes the dish's dominant colour (red stuffed peppers on a red painted table, a saffron risotto on ochre linen). Bold and editorial.
- COMPLEMENTARY: the table sets off the dish's colour (golden roast potatoes on a blue cloth, a green herb dish on terracotta). Makes the food glow.
- NEUTRAL: stone, pale linen, dark slate or deep charcoal that lets a colourful or refined dish speak alone. Often right for premium plates. Do not always pick the same approach.

Then write the prompt:

1. The food, from step 1.
2. The serving vessel that suits the dish, its cuisine and its level: a cast-iron cocotte for a pot roast, an oval platter for a whole chicken, a tagine, a brass thali, a hand-thrown bowl for ramen, a fine rimmed porcelain plate for a plated premium dish. Give material and colour. Dishes cooked whole (roasts, cakes, tarts, gratins, lasagna) may be shown whole.
3. The setting, from A, B and C: the surface and any tablecloth with their colour, the cutlery and glassware, and 2 to 4 props. Props are either tableware true to the cuisine and level, or raw ingredients from the recipe's own list. Props stay at the edges and never cover the dish.

Do not default to a rustic wooden table. Wood is one surface among many, and only when the cuisine, the level and the palette call for it.

--- STEP 3: THE "plate" PROMPT ---

One serving of the same dish on a single round plate or bowl. It will be photographed from directly above and cut out along the rim.

1. The vessel is ALWAYS one round plate or one round bowl. Never oval, square, a board, a pot or a baking dish. Use a shallow round bowl for soups, stews, curries, risotto, pasta in sauce, gnocchi, dressed salads, porridge and anything liquid; a flat round plate for everything else. Give its colour and finish: cream, pale grey, speckled stoneware, or a soft coloured glaze, with a clearly visible rim. Never a plain bright white plate.
2. The food, from step 1, as ONE generous portion, the way a good restaurant plates it: plenty on the plate, never a sad or sparse serving. For instance slices of the roast rather than the whole joint, a thick slice of cake or tart, a square of lasagna, a full bowl of soup. Exception: a dish that is naturally round and served whole at plate size (a pizza, an individual tart, a galette) may be shown whole.

Quantities follow food-styling rules:

- Always an ODD number of visible pieces: 3, 5 or 7. Never 2 or 4.
- Sliced meat or fish (steak, roast, duck breast, pork loin, salmon fillet): 5 to 7 slices, fanned and overlapping so the cut face shows, or a whole steak or fillet with 2 or 3 slices cut from its end and leaned against it.
- Small pieces (scallops, prawns, meatballs, dumplings, gnocchi, roast potatoes): 5 to 9.
- Chops, drumsticks, fish fillets, burgers served whole: 1 big piece, or 3 small ones.
- Sides and garnishes are part of the portion: if the recipe has a starch, vegetables or a sauce, all of them are on the plate, and the protein sits on or beside them rather than alone. The food covers about half to two-thirds of the plate's surface, with height where the dish allows it (leaning slices, a stacked pile, a mound of purée), so it never reads as a few flat pieces lost on a large plate.
3. The plating: food arranged around the centre and kept well inside the rim, with a ring of plate visible all around it. Sauce pooled, spooned or swooshed on the plate, never over the rim. Nothing crosses or leans over the rim: no bone, stalk, leaf or cutlery.
4. No props, no table, no other object. The plate and the food only.

--- GENERAL RULES ---

- Visual description only: no recipe steps, no quantities, no cooking times.
- A dish name is not a description. You may open with it, then describe what it looks like: "coq au vin" tells an image model little; "chicken pieces braised a deep mahogany in a glossy red-wine sauce with button mushrooms, lardons and pearl onions" tells it everything.
- No people, hands, faces, text, labels, logos or brand names.
- Each prompt is 2 to 4 sentences, dense with visual detail. No filler words such as "delicious", "mouth-watering" or "perfect".
- Output ONLY the JSON object: no explanation, no markdown fence.

--- EXAMPLE ---

Input: Title: Poulet rôti aux légumes grillés Ingredients: 1 poulet entier, 2 courgettes, 2 courges jaunes, 2 poivrons rouges, 3 carottes, 1 bouquet de persil plat, 4 gousses d'ail, huile d'olive, paprika, sel, poivre Instructions: Frotter le poulet d'huile, de paprika et d'ail écrasé. Rôtir 1h15 à 200°C. Griller les courgettes et les courges en rondelles épaisses, rôtir les poivrons et les carottes. Servir le poulet sur les légumes, parsemer de persil ciselé.

Output: {"cover": "A whole roast chicken with golden, crackling paprika-dusted skin, resting on a bed of thick courgette and yellow squash rounds with dark charred grill marks, soft blistered strips of red pepper and chunks of roasted carrot, sprinkled with chopped flat-leaf parsley. Served on a large oval cream stoneware platter. The table is set for a family Sunday lunch with a soft sage-green linen tablecloth, simple brushed steel cutlery and tumblers of water, two whole red peppers and a head of garlic in a small ceramic bowl at one side and a loose bunch of flat-leaf parsley.", "plate": "A flat round speckled cream stoneware plate with a clearly visible rim. Around its centre, a generous pile of thick courgette and yellow squash rounds with dark charred grill marks, soft blistered strips of red pepper and chunks of roasted carrot, topped by a fan of five overlapping slices of roast chicken breast with golden, crackling paprika-dusted skin and one drumstick leaning against them, sprinkled with chopped flat-leaf parsley, the food covering about two-thirds of the plate and kept well inside the rim."}

Other settings, to show the range. Never reuse them word for word:

- Dal tadka, everyday Indian: a hammered copper bowl on a deep indigo block-printed cotton cloth, a stack of roti, a small brass katori of pickle, a steel tumbler.
- Beef fillet with a red-wine reduction, premium French: a fine white rimmed porcelain plate on a dark polished walnut table, heavy silver cutlery, a crystal glass of red wine, a cut-glass decanter, a pressed grey linen napkin.
- Saffron risotto, generous Italian: a wide pale ceramic bowl on an ochre linen cloth, a wedge of parmesan with a small knife, a carafe of white wine, two stemmed glasses.`

/** What each shot appends to the model's prompt, and the size it is rendered at. */
const SHOTS = {
  cover: {
    width: 768,
    height: 512,
    promptSuffix: "Professional editorial food photography for a cookbook or food magazine, camera positioned at approximately a 30–35° downward angle, slightly more top-down than a traditional 45° three-quarter view above the table, the dish as the clear hero in sharp focus and filling most of the frame, props and background softly blurred with a shallow depth of field, natural soft side light with gentle realistic shadows, rich true-to-life colours, glistening appetizing textures, landscape 3:2 aspect ratio, high resolution. No text, no watermark, no logos, no people, no hands.",
    promptUpsampling: true,
  },
  plate: {
    width: 512,
    height: 512,
    promptSuffix: "Shot from directly overhead at exactly 90 degrees, a true top-down view in which the plate appears as a perfect circle, the whole round plate visible and centred with an even margin of empty background on every side, the plate filling about 85% of the frame, isolated on a plain solid neon ORANGE background (#FF6D2D), soft even diffused studio lighting, a faint soft shadow just around the rim, nothing outside the plate: no cutlery, no napkin, no crumbs, no stray garnish, crisp focus across the whole plate, true-to-life appetizing colours, professional food photography, square 1:1 aspect ratio, high resolution. No text, no watermark, no people, no hands.",
    promptUpsampling: false,
  },
} as const;

type Shot = (typeof SHOTS)[keyof typeof SHOTS];

/** One rendered image, as a URL. Throws when the model returns nothing usable. */
const _render = async (prompt: string, shot: Shot): Promise<string> => {
  const output = await runImage({
    width: shot.width,
    height: shot.height,
    model: "prunaai/p-image-ideogram",
    prompt: `${prompt} ${shot.promptSuffix}`,
    promptUpsampling: shot.promptUpsampling,
  });

  const images = await parseReplicateRunOutput(output);
  const url = await images[0]?.toUrl();
  if (!url) throw new Error("Failed to generate image");

  return url;
};

/**
 * The plate render with its background cut away, or nothing.
 *
 * Nothing rather than a throw: the cover is already rendered by the time this runs, and a failed
 * cut-out is no reason to lose it. The recipe keeps whichever plate it had, if any.
 */
const _cutOutPlate = async (url: string) => {
  try {
    const cutout = await removeBackground(url);
    return { withBackground: url, withoutBackground: cutout.url, position: cutout.position };
  } catch (error) {
    console.warn("generateRecipeImages: plate background removal failed", error);
    return undefined;
  }
};

export const generateRecipeImages = createTool({
  description: "Generates two realistic food photography images for a recipe: a cover shot and a plate shot. " +
    "The tool uses the recipe name, description, ingredients and instructions to create detailed visual prompts, " +
    "generates a landscape cover image and a top-down plate image, " +
    "and returns both generated images with the plate's background removed.",
  inputSchema: _inputSchema,
  execute: async (ctx, args) => {
    const rawPrompts = await wrapAgent(imagesGeneratorAgent).generateObject(ctx, {}, {
      model: models.prompterMini.model,
      providerOptions: models.prompterMini.providerOptions({ effort: "low" }),
      instructions: INSTRUCTIONS,
      schema: _outputSchema,
      output: "object",
      maxRetries: 3,
      prompt: [
        `Title: ${args.name}`,
        args.description ? `Description: ${args.description}` : undefined,
        args.ingredients ? `Ingredients: ${args.ingredients}` : undefined,
        `Instructions: ${args.instructions}`,
      ].filter(notEmpty).join("\n"),
    }, { storageOptions: { saveMessages: "none" } })

    const prompts = parseModelOutput(_outputSchema, rawPrompts.object);

    // Settled, not all: the two renders are independent, and one failing should not discard the other.
    const [cover, plate] = await Promise.allSettled([
      _render(prompts.cover, SHOTS.cover),
      _render(prompts.plate, SHOTS.plate),
    ]);

    if (cover.status === "rejected" && plate.status === "rejected") {
      throw new Error(`Failed to generate both recipe images: cover (${cover.reason}), plate (${plate.reason})`);
    }

    if (cover.status === "rejected") console.warn("generateRecipeImages: cover render failed", cover.reason);
    if (plate.status === "rejected") console.warn("generateRecipeImages: plate render failed", plate.reason);

    return {
      coverImage: cover.status === "fulfilled" ? cover.value : undefined,
      plateImage: plate.status === "fulfilled" ? await _cutOutPlate(plate.value) : undefined,
    };
  }
});
