import { AuthScreen } from "~/modules/auth/screen";
import { useMeasuredModalSheet } from "~/modules/navigation/modal-sheet";

/**
 * The sign-in, as a sheet over the page that asked for it. Routing only: no data access lives here
 * (ADR 0006). Its path stays `/auth`, which is what `useRequireSignIn` and an OAuth return open.
 *
 * Nothing here closes it after a sign-in: `AuthGate` resets the navigator then, which takes the
 * sheet away with everything else.
 */
export default function Auth() {
  const onLayout = useMeasuredModalSheet({ isFullBleed: true });

  return <AuthScreen onLayout={onLayout} />;
}
