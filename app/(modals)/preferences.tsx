import { useRouter } from "expo-router";
import { useCallback } from "react";
import { PreferencesScreen } from "~/modules/planning/preferences-screen";

export default function Preferences() {
  const router = useRouter();

  /**
   * Stable, because the screen hands it to the chrome as the delete action's dismissal. Rebuilt
   * per render it would re-declare that action on every keystroke in the search box.
   */
  const close = useCallback(() => router.back(), [router]);

  return (<PreferencesScreen onClose={close} />)
}
