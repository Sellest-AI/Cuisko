import { useLocalSearchParams } from "expo-router";
import { IngredientsScreen } from "~/modules/recipes/detail/ingredients";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <IngredientsScreen id={id} />;
}
