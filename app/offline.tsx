import { OfflinePage } from "~/modules/network/offline-page";

/**
 * Routing only — one module component. No data access lives here (ADR 0006); lint R4 enforces it.
 */
export default function Offline() {
  return <OfflinePage />;
}
