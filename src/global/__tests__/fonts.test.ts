import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { H4_FONT_FAMILY, H4_FONT_WEIGHT } from "fonts";

/**
 * Both of these fail silently in the app, which is why they are pinned here: nothing else would
 * report either one.
 */
describe("the H4 font", () => {
  it("is never requested at a weight Android sends to the system font", () => {
    // `expo-font` registers the file in the NORMAL slot only, and React Native maps any weight of
    // 700 or more to the BOLD slot. Unbounded Bold was once requested at 700, found that slot empty,
    // and rendered as Roboto Bold on Android while iOS showed the right face.
    expect(H4_FONT_WEIGHT).toBeLessThan(700);
  });

  it("is the only font file shipped", () => {
    // Every file in `assets/fonts` is bundled for every user, loaded or not — a leftover from
    // trying faces costs 300 KB and shows nothing. `Nunito-750.ttf` → `Nunito750`.
    //
    // From the project root, where Vitest runs: under the jsdom environment `import.meta.url` is not
    // a `file:` URL.
    const fontsDir = path.resolve(process.cwd(), "assets/fonts");
    const families = readdirSync(fontsDir)
      .filter((file) => file.endsWith(".ttf"))
      .map((file) => file.replace(/\.ttf$/, "").replace("-", ""));

    expect(families).toEqual([H4_FONT_FAMILY]);
  });
});
