/* An image imported as a module — `import cuisko from "assets/images/cuisko/cuisko-pot.webp"`.
 *
 * Expo types `require()` as `any`, which is why `require("assets/…​.png")` has always typechecked
 * here without a declaration. A static `import` is not so lucky, and static is what these have to
 * be: `require()` is Node's CJS resolver under Vitest, which reads neither the tsconfig `paths`
 * block nor the alias list in vitest.config.mts, so a `require()`d asset anywhere in a module's
 * import graph takes down every test that transitively reaches it. That is not hypothetical — it
 * is what `src/lib/vocabulary.ts` did to `planning/_model/options.test.ts` the moment it grew an
 * image map.
 *
 * `number | string` because the two bundlers disagree and both are correct: Metro resolves an
 * asset to its numeric registry id, Vite (so, Vitest) to a URL string. `expo-image` accepts
 * either, so the union is what a call site can actually rely on — narrowing it to one would be a
 * lie under whichever bundler was not chosen.
 */

declare module "*.webp" {
  const asset: number | string;
  export default asset;
}

declare module "*.png" {
  const asset: number | string;
  export default asset;
}

declare module "*.jpg" {
  const asset: number | string;
  export default asset;
}

declare module "*.jpeg" {
  const asset: number | string;
  export default asset;
}

declare module "*.webm" {
  const asset: number | string;
  export default asset;
}

/* A Lottie animation. Metro only bundles it once `lottie` is in `assetExts` (metro.config.js). */
declare module "*.lottie" {
  const asset: number | string;
  export default asset;
}

/* A font face, loaded by `useFonts` in `src/providers/fonts.tsx`. `ttf` is already one of Metro's
 * default asset extensions, so unlike `.lottie` this needs no `metro.config.js` entry.
 *
 * Imported statically for the same reason as everything above, and it matters more here: the only
 * module allowed to reference these files is `providers/fonts.tsx`. The face's name and metrics
 * live in `src/global/fonts.ts`, which holds no asset, so that `theme.ts` can read them without
 * dragging a bundler asset into every test's import graph. */
declare module "*.ttf" {
  const asset: number | string;
  export default asset;
}
