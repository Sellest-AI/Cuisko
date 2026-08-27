import { useLocalSearchParams } from "expo-router";

import { EditorScreen } from "~/modules/recipes/editor-screen";

/**
 * Rewriting a recipe that already exists.
 *
 * The route owns the id and nothing else; the editor decides what to load with it. Until the
 * module fetches a real recipe, the id only chooses the title the screen writes at the top.
 */
export default function EditRecipe() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <EditorScreen recipeId={id} />;
}
