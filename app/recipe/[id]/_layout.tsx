import { Slot } from "expo-router";

import { RecipeChrome } from "~/modules/recipe/chrome";

/**
 * A recipe's three tabs. Routing and chrome placement only — what the chrome shows is the
 * module's, not the route's.
 *
 * `Slot` rather than `Stack`: the chrome mounts its children inside a scroll container, and a
 * navigator has no content height to give one. It is a `flex: 1` view built to fill a bounded
 * viewport, so against a scroll container's unbounded height it measures to zero and the tab
 * renders invisible. `Slot` hands over the matched route itself, which sizes from its own content.
 * The transition between tabs moves with it, into the chrome.
 */
export default function RecipeLayout() {
  return (
    <RecipeChrome>
      <Slot />
    </RecipeChrome>
  );
}
