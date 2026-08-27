import { useLocalSearchParams } from "expo-router";

import { InstructionsScreen } from "~/modules/recipes/detail/instructions";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <InstructionsScreen id={id} />;
}
