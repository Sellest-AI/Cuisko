import { Stack, useLocalSearchParams } from "expo-router";

import { PlanningScreen } from "~/modules/planning/screen";

export default function Planning() {
  const { date } = useLocalSearchParams<{ date?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <PlanningScreen focusDate={date} />
    </>
  );
}
