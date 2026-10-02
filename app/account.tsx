import { AccountScreen } from "~/modules/account/drawer-screen";

/**
 * Routing only: one module component. No data access lives here (ADR 0006); lint R4 enforces it.
 * Presented transparent from the root layout, so the page it opened over stays in view.
 */
export default function Account() {
  return <AccountScreen />;
}
