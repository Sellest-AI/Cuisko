import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";
import { ImportScreen } from "~/modules/recipes/import-screen";

export default function ImportRecipe() {
  const onLayout = useMeasuredModalSheet();

  return <ImportScreen onLayout={onLayout} />;
}
