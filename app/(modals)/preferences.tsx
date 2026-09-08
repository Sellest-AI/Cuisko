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

  /**
   * The sheet is cut to the profile's own height. Three groups of chips vary enough between
   * households that a fixed detent would leave a gap under one and clip another.
   */
  const onLayout = useMeasuredModalSheet();

  return (<PreferencesScreen onClose={close} onLayout={onLayout} />)
}
