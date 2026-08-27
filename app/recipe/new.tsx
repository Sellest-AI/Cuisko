import { EditorScreen } from "~/modules/recipes/editor-screen";

/**
 * Writing a recipe from scratch.
 *
 * The counterpart of `edit/[id]`, and the same screen: with no id to load, the editor opens empty.
 */
export default function NewRecipe() {
  return <EditorScreen />;
}
