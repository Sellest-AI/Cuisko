import { useRouter } from "expo-router";

import { DeleteAccountScreen } from "~/modules/account/delete-screen";
import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";

/**
 * Asking to delete the account. Routing only: the route owns how the sheet dismisses itself and
 * nothing else (ADR 0006).
 */
export default function DeleteAccount() {
  const router = useRouter();
  const onLayout = useMeasuredModalSheet();

  return <DeleteAccountScreen onClose={() => router.back()} onLayout={onLayout} />;
}
