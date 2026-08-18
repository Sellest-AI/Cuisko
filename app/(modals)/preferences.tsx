import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";
import { PreferencesScreen } from "~/modules/planning/preferences-screen";

export default function Preferences() {
  const router = useRouter();

  /**
   * Stable, because the screen hands it to the chrome as the delete action's dismissal. Rebuilt
   * per render it would re-declare that action on every keystroke in the search box.
   */
  const close = useCallback(() => router.back(), [router]);

  /** Three options and a label: the sheet is cut to exactly this, so nothing here is flexed. */
  const onLayout = useMeasuredModalSheet();

  return (<PreferencesScreen onClose={close} onLayout={onLayout} />)
}
