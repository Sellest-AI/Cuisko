import { useConnection } from "./useConnection";

/** True once the socket has been down for the grace period (`useConnection`). */
export const useIsOffline = () => useConnection().isOffline;
