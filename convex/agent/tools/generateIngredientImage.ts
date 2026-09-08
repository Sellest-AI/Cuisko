"use node"
import z from "zod/v4";
import { createTool, wrapAgent } from "../utils";
import { Locale, SUPPORTED_LOCALES } from "@shared/translations";
import { CATEGORIES } from "@shared/categories";
import { runImage } from "@convex/lib/replicate/node";
import { parseReplicateRunOutput } from "@convex/lib/replicate/utils";
import { defaultAgent } from "../agents";
import { models } from "../config";
import { removeBackground } from "@convex/lib/runpod/removeBackground";
import { notEmpty } from "@shared/helpers";

const _perLocale = <T extends z.ZodType>(value: T) =>
  z.object(Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, value])) as {
    [K in Locale]: T;
  });

const _inputSchema = z.object({
  names: _perLocale(z.array(z.string())),
  aliases: z.optional(_perLocale(z.array(z.string()))),
  category: z.optional(z.enum(CATEGORIES)),
})

const INSTRUCTIONS = `You are a prompt-writing agent. Your ONLY job is to take the name of an ingredient or product
and output a single image-generation prompt describing that item — WITHOUT any background,
lighting, or style description. Those are added automatically by the script afterward.
Never mention "white background," "studio lighting," "emoji style," or "1:1 aspect ratio" —
that part is handled separately.

Your output should describe ONLY:
1. The object itself (shape, color, texture, material, condition — fresh, sliced, whole, etc.)
2. Any container/packaging it realistically needs (see rules below)
3. Small accurate details that make it recognizable (droplets, foam, peel, wrapper, cap, etc.)

--- CATEGORY RULES ---

RAW INGREDIENTS (fruits, vegetables, meats, eggs, dairy, nuts, grains, herbs, spices):
- Show the ingredient in its natural, recognizable form.
- If it's commonly shown whole AND cut (e.g. lemon, avocado, tomato), you may include one
  whole piece plus one cut/cross-section piece to aid recognition — never more than 2 pieces.
- Do NOT invent a container unless the ingredient cannot stand alone (see LIQUIDS below).
- Spices/herbs: show a small realistic pile or pinch, or in a small glass jar/bowl if that's
  how they're commonly depicted.

LIQUIDS & POURABLE INGREDIENTS (oil, vinegar, milk, juice, sauces, honey, syrup):
- These CANNOT be rendered without a vessel. Always include an appropriate, realistic container:
  glass bottle, jar, carton, or squeeze bottle depending on the item.
- Describe the container's material (glass/plastic/cardboard), cap type, and fill level,
  and let a little of the liquid's color show through if the container is transparent.
- Labels must be GENERIC/UNBRANDED — a plain colored label or none at all. Never depict real
  brand names, logos, or trademarked packaging designs.

BEVERAGES (soda, water, beer, energy drinks, juice boxes, canned coffee):
- Always include the container type people actually associate with the drink: aluminum can,
  glass bottle, plastic bottle, tetra-pak carton with straw, etc.
- Describe condensation droplets on the outside if the drink is typically served cold.
- Carbonated drinks may show a small splash or a few rising bubbles beside/behind the container
  for context, kept subtle and not obscuring the object.
- Generic/unbranded label only — plain color and simple typography, no real brand names or logos.

CLEANING & HOUSEHOLD PRODUCTS (dish soap, detergent, gel, sprays, wipes, bleach):
- Always include realistic, generic packaging: bottle with pump/flip-cap, spray trigger bottle,
  detergent jug, gel pouch, box, etc. — match the packaging type people actually associate
  with that product.
- If the product is a gel or liquid, you may show a small dollop/drop of the product's
  characteristic color next to or on the container to reinforce what it is.
- Generic label only — no real brand names or logos.

CLEANING TOOLS / CONSUMABLES (sponges, scrub brushes, cloths, steel wool, gloves):
- Render the item itself, no container needed.
- Include texture details that make the material obvious (porous foam, coarse bristles,
  woven fabric, etc.) and optionally light soap suds or a few water droplets for context.

PACKAGED/PROCESSED FOOD PRODUCTS (cereal, pasta, canned goods, snacks, chips, crackers):
- Include realistic packaging (box, bag, can, pouch) appropriate to the product.
- Generic label design only — plain color/typography, no real branding.
- For cans/jars, you may describe a small cutaway or a few pieces of the product resting
  beside the container to show contents.

FROZEN GOODS (frozen vegetables, ice cream, frozen meals, ice pops, frozen dough):
- Include the typical packaging: cardboard box, plastic bag, tub, or wrapper.
- Add light frost/ice crystal detail on the packaging or on the product itself if commonly
  seen frozen (e.g. frost on a bag of peas, condensation mist around an ice cream tub).
- If showing the product outside its packaging (e.g. an ice cream scoop, an ice pop),
  give it a slightly glossy, hard-frozen surface texture rather than a melted look,
  unless "melting" is specifically requested.
- Generic label only — no real branding.

MEDICINE & PHARMACY ITEMS (pills, tablets, syrups, ointments, bandages, thermometers):
- Include realistic, generic packaging: pill bottle, blister pack, syrup bottle with cap,
  ointment tube, bandage box, etc.
- Blister packs may show a few pills/capsules partially popped out or visible through
  the foil/plastic for clarity.
- Labels must be plain and generic (e.g. a white label with a simple cross or plus symbol
  if needed for recognizability) — never real drug names, brand names, or logos.
- Keep the depiction neutral and non-alarming (no medical warnings, no syringes/needles
  unless specifically requested).

TOOLS & UTENSILS (if relevant to the project, e.g. whisk, knife, ladle):
- Render the tool alone, accurate materials (stainless steel, wood, silicone), no container.

--- GENERAL RULES ---
- Always keep proportions realistic relative to a single object filling most of the frame.
- Never include human hands, faces, or other objects unless essential to reading the item
  (e.g. a spray bottle's trigger).
- Never use real brand names, logos, or copyrighted packaging designs — always generic/neutral.
- Keep the prompt to 1–3 sentences, dense with visual detail, no filler language.
- Output ONLY the prompt text. No explanations, no labels like "Prompt:", no quotation marks.

--- FRAME-FILLING COMPOSITION RULES ---

Since images will be used as square icons, elongated or irregularly-shaped items should be
composed to naturally fill more of the square frame — WITHOUT distorting the object's real
shape. Never make an object literally square, blocky, or unnaturally bent to fit the frame.
Instead, choose ONE of these natural composition strategies based on the item's shape:

1. NATURAL CURVE — if the object already has a natural curve or bend (banana, shrimp, hose,
   celery stalk), orient it so the curve arcs across the frame diagonally or into a C/S-shape,
   using its own natural geometry to cover more area without straightening it into a rigid line.

2. DIAGONAL TILT — for straight rigid elongated objects (carrot, breadstick, spaghetti strand,
   cucumber, asparagus spear), angle the object diagonally across the frame (e.g. lower-left to
   upper-right) rather than perfectly horizontal or vertical, so its length spans more of the
   square's diagonal.

3. MULTIPLE PIECES / GROUPING — for thin or small items where one piece can't reasonably fill
   a square (carrots, asparagus, green beans, breadsticks, chopsticks), show 2–4 pieces
   arranged together (fanned out, crossed, or bundled at slightly different angles) so the
   group fills the frame while each individual piece keeps its correct proportions.

4. ROTATED/FORESHORTENED VIEW — for cylindrical items (canned goods, bottles, jars), a slight
   3/4 angle view rather than a flat side-on view can add visual height/depth without changing
   the object's shape, as long as labels remain legible.

5. NATURAL CLUSTERING — for small round/irregular items (grapes, berries, nuts, garlic cloves),
   group a small cluster (3–6 pieces) rather than isolating a single tiny item that would leave
   excessive empty space in the square frame.

Do NOT: stretch, bend, flatten, or square off an object's natural shape to fit the frame.
Do NOT arbitrarily oversize an object beyond realistic proportions just to fill space —
use composition and arrangement, never distortion or false scale.

--- EXAMPLES ---

Input: tomato
Output: A single whole ripe red tomato with smooth glossy skin and a small green stem,
next to one tomato half revealing juicy seeds and flesh inside.

Input: dish soap
Output: A plastic squeeze bottle with a flip-top cap, three-quarters full of bright green
dish soap gel, with a small dollop of the same green gel resting beside the bottle,
plain unbranded label.

Input: sponge
Output: A rectangular two-layer cleaning sponge with a soft yellow porous foam top and a
green scouring pad bottom, slightly worn texture with a few visible soap suds clinging to one corner.

Input: olive oil
Output: A tall clear glass bottle filled with golden-green olive oil, a narrow pour spout
and cork stopper, plain unbranded cream-colored label.

Input: banana
Output: A single ripe yellow banana with a few small brown speckles, its natural curve arcing
diagonally across the frame from lower-left to upper-right, stem end slightly raised.

Input: carrot
Output: Three whole orange carrots with textured skin and trimmed leafy green tops, fanned
out at slightly different diagonal angles with one carrot crossing over the others.

Input: honey
Output: A short squat clear glass jar filled nearly to the brim with thick golden-amber honey,
topped with a brushed brass screw-cap lid, a slow viscous drip trailing down the inside wall,
a wooden honey dipper resting beside the jar with a small amount of honey dripping from its tip,
plain unbranded off-white label.

Input: asparagus
Output: A small bundle of four asparagus spears with textured tips, loosely crossed and
angled at varying diagonals, tied lightly near the base.

Input: grapes
Output: A small cluster of six deep-purple grapes with a light natural bloom on their skins,
grouped closely together with one grape slightly separated in front.

Input: pain relief tablets
Output: A small white plastic pill bottle with a childproof cap and plain generic label
featuring a simple cross symbol, a few round white tablets scattered beside the bottle.`

export const generateIngredientImage = createTool({
  description: "Generates a realistic, icon-ready image for an ingredient or product." +
    "The tool uses the product name, aliases, and category to create a detailed visual prompt," +
    "generates a 512×512 image with appropriate packaging and recognizable details, " +
    "and returns the generated image with its background removed.",
  inputSchema: _inputSchema,
  execute: async (ctx, args) => {
    const prompt = await wrapAgent(defaultAgent).generateText(ctx, {}, {
      model: models.prompterMini.model,
      providerOptions: models.prompterMini.providerOptions({ effort: false }),
      instructions: INSTRUCTIONS,
      maxRetries: 3,
      prompt: [
        `Product: ${Object.values(args.names).flat().join(", ")}`,
        args.aliases ? `Aliases: ${Object.values(args.aliases).flat().join(", ")}` : undefined,
        args.category ? `Category: ${args.category}` : undefined,
      ].filter(notEmpty).join("\n"),
    }, { storageOptions: { saveMessages: "none" } })


    const output = await runImage({
      height: 512,
      width: 512,
      model: "prunaai/z-image-turbo",
      prompt: [
        prompt.text,
        "Rendered in 3D volumetric style, photorealistic materials and textures, soft studio lighting with gentle contact shadow beneath the object, subtle glossy or matte finish depending on material, rounded volumetric proportions typical of emoji design, centered composition, isolated on a plain solid white background (#FFFFFF), no text, no watermark, no extra props, no shadows on the background itself, square 1:1 aspect ratio, high-resolution product-photography quality. IMPORTANT : inanimate object only, no face, no eyes."
      ].join(" ")
    })

    const imagesWithBackground = await parseReplicateRunOutput(output);
    const imageWithBackground = (await imagesWithBackground[0]?.toUrl());

    if (!imageWithBackground) throw new Error("Failed to generate image");

    const imageWithoutBackground = await removeBackground(imageWithBackground);

    return {
      prompt: prompt.text,
      imageUrlwithBackground: imageWithBackground,
      imageAlphaBase64: imageWithoutBackground.url,
      position: imageWithoutBackground.position,
    }
  }
});
