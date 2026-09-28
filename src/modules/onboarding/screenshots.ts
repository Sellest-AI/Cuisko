import groceriesScreen from "assets/images/onboarding/screens/groceries.webp";
import recipesScreen from "assets/images/onboarding/screens/recipes.webp";
import importScreen from "assets/images/onboarding/screens/import.webp";
import planScreen from "assets/images/onboarding/screens/plan.webp";
import cookScreen from "assets/images/onboarding/screens/cook.webp";
import weekScreen from "assets/images/onboarding/screens/week.webp";

import type { Section } from "./_model/steps";

/**
 * Width over height of every screenshot: the phone's 923 × 2000, less the 84 px status bar cut off
 * the top so the frame shows the app and not the phone's clock. The frame takes this ratio, so the
 * screenshot is shown whole across and never zoomed. One value, so all six must be taken alike.
 */
export const SCREENSHOT_ASPECT_RATIO = 923 / 1916;

/** What a screenshot page can show: a section's intro, or the import, which is only shown. */
export type Showcase = Section | "import";

/**
 * A screenshot of the real app for each section's intro (the page the next few screens teach, so
 * the cook sees where it lives before they practise it) and for the import, shown rather than done.
 *
 * Real screens of the app, status bar cut, compressed to about 50 KB each (webp, 1400 px on the long side). `null`
 * shows Cuisko in the phone frame instead. A total `Record`, so a page added without deciding its
 * screenshot does not compile.
 */
export const SCREENSHOTS: Record<Showcase, number | string | null> = {
  groceries: groceriesScreen,
  recipes: recipesScreen,
  import: importScreen,
  plan: planScreen,
  cook: cookScreen,
  week: weekScreen,
};
