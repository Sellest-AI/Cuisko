import { Stack, useLocalSearchParams } from "expo-router";
import { GroceryScreen } from "~/modules/groceries/list-screen";

export default function Groceries() {
  const { section } = useLocalSearchParams<{ section?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <GroceryScreen section={section} />
    </>
  )
}
