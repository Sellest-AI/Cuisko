import { useLocalSearchParams, useRouter } from "expo-router";

import { QuantityScreen } from "~/modules/groceries/quantity-screen";
import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";

/**
 * How much of an ingredient was added, taken back, or taken out.
 *
 * The route owns the navigation and nothing else: it reads the params and hands the screen the
 * one thing it cannot know, which is how to dismiss itself.
 */
export default function Quantity() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ingredientId?: string; unit?: string; intent?: string }>();
  const onLayout = useMeasuredModalSheet();

  return <QuantityScreen
    params={params}
    onClose={() => router.back()}
    onLayout={onLayout}
  />;
}
