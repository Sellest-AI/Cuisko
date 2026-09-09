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
