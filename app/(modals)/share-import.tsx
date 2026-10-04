import { useLocalSearchParams } from "expo-router";

import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";
import { ShareImportScreen } from "~/modules/recipes/share-import-screen";

/**
 * The sheet a link shared to Cuisko opens on. The route reads the link and nothing else: the
 * import, and where it leads when it lands, are the screen's hook's.
 */
export default function ShareImport() {
  const onLayout = useMeasuredModalSheet();
  const { url } = useLocalSearchParams<{ url?: string }>();

  return <ShareImportScreen url={url ?? ""} onLayout={onLayout} />;
}
