/**
 * The display face H4 and the large figures are set in: Nunito at weight 750, a rounded sans.
 * Nunito ships no 750, so the file is a static instance cut from Google Fonts' variable
 * `Nunito[wght].ttf` with `fontTools.varLib.instancer` — between ExtraBold (800) and Bold (700). It
 * replaced Unbounded Medium, a wide geometric face.
 *
 * Imported as `fonts` (a tsconfig path). **Names and numbers only, never the font file.** The file
 * is loaded in `src/providers/fonts.tsx`, and must stay there: `theme.ts` reads this module and
 * nearly everything reads `theme.ts`, and under Vitest an asset anywhere in that import graph takes
 * down every test that reaches it (the resolver is Node's CJS one, which reads neither the tsconfig
 * `paths` nor the aliases in `vitest.config.mts` — `assets/images.d.ts` has the history).
 *
 * What needs watching is width, not height: a wide face wraps a long heading sooner than the system
 * sans did at the same size.
 */

/**
 * The family name the file is registered under by `useFonts`, and the one `fontFamily` asks for.
 * One constant for both, so they cannot drift apart.
 */
export const H4_FONT_FAMILY = "Nunito750";

/**
 * Multiplied by `fontSize` to get `lineHeight`. **A floor, not a preference.**
 *
 * Measured from the glyph outlines — the tallest and deepest glyphs among the characters a heading
 * can contain, accented capitals included, because the app is bilingual and `Éclair` is a recipe.
 * Below it the letters are clipped: Android crops rather than overflows. It is not the font's own
 * reserve, which covers every glyph in the file and asks for 1.38. `Å` sets the top, `Q` the bottom.
 */
export const H4_LINE_HEIGHT_RATIO = 1.21;

/**
 * The line the face asks for on its own: `hhea` ascent 1011 plus descent 353, per 1000 units.
 *
 * Kept because the gap between it and `H4_LINE_HEIGHT_RATIO` is taken off the **top** of the line
 * box, not split, so the letters sit high in it and look top-aligned beside an icon under
 * `alignItems: "center"`. On iOS, `Text.H4` shifts them back down by half that gap.
 */
export const H4_NATURAL_LINE_HEIGHT_RATIO = 1.364;

export const H4_LETTER_SPACING = -0.45;

/**
 * The weight H4 is **requested** at, which is not the weight it renders at.
 *
 * A loaded face carries its weight in the file: this one is 750 because the file is. `expo-font`
 * registers every file as its own family, in its `NORMAL` slot only (`FontLoaderModule.kt`,
 * `setTypeface(fontFamilyName, Typeface.NORMAL, typeface)`), so the request has to land there.
 *
 * On Android the line is **700**. Below it the `NORMAL` slot returns the file unchanged, so asking
 * for a heavier weight does nothing — the weight only changes by loading a different file. At 700 or above
 * `ReactFontManager` looks in the empty `BOLD` slot, finds no matching file in the native assets,
 * and returns **the system font**, with no warning. iOS matches the file by name and shows it
 * anyway, which is what makes that so easy to ship. To change weight, load a different file.
 */
export const H4_FONT_WEIGHT = 400;
