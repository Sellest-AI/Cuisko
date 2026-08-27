import { useLocalSearchParams } from "expo-router";
import { OverviewScreen } from "~/modules/recipes/detail/overview";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <OverviewScreen id={id} />;
}
