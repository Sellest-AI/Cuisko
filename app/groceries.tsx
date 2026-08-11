import { Stack } from "expo-router";
import { GroceryScreen } from "~/modules/groceries/screen";

export default function Groceries() {
  return (
    <>
      <Stack.Screen options={{ title: "Cuisko" }} />
      <GroceryScreen />
    </>
  )
}
