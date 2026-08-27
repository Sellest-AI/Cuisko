/**
 * The door. Everything another module may reach for in `recipes/` is re-exported here, and nothing
 * else is — the interior stays closed behind `_hooks/`, `_components/` and `_model/` (lint R8).
 *
 * It exists because the editor lives in `recipe/` and the writing lives in `recipes/`, so every
 * save is a cross-module call. One line here is the legal path; reaching past the underscore is not.
 */

export { useCreateRecipe, type RecipeDraft } from "./_hooks/useCreateRecipe";
export type { CreatingPhase } from "./_model/progress";
