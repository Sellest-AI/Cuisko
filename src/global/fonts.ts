/**
 * The display face H4 is set in: Unbounded Medium (500), a wide geometric sans. Chosen over its
 * Regular (too light) and 550, SemiBold and Bold (too heavy), after a round of handwriting faces
 * that were all rejected.
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
export const H4_FONT_FAMILY = "UnboundedMedium";

/**
 * Multiplied by `fontSize` to get `lineHeight`. **A floor, not a preference.**
 *
 * Measured from the glyph outlines — the tallest and deepest glyphs among the characters a heading
 * can contain, accented capitals included, because the app is bilingual and `Éclair` is a recipe.
 * Below it the letters are clipped: Android crops rather than overflows. It is not the font's own
 * reserve, which covers every glyph in the file and asks for 1.55.
 */
export const H4_LINE_HEIGHT_RATIO = 1.23;

export const H4_LETTER_SPACING = -1;

/**
 * The weight H4 is **requested** at, which is not the weight it renders at.
 *
 * A loaded face carries its weight in the file: this one is Medium because the file is. `expo-font`
 * registers every file as its own family, in its `NORMAL` slot only (`FontLoaderModule.kt`,
 * `setTypeface(fontFamilyName, Typeface.NORMAL, typeface)`), so the request has to land there.
 *
 * On Android the line is **700**. Below it the `NORMAL` slot returns the file unchanged, so asking
 * for 500 does nothing — Medium only appeared once its own file was loaded. At 700 or above
 * `ReactFontManager` looks in the empty `BOLD` slot, finds no matching file in the native assets,
 * and returns **the system font**, with no warning. iOS matches the file by name and shows it
 * anyway, which is what makes that so easy to ship. To change weight, load a different file.
 */
export const H4_FONT_WEIGHT = 400;
