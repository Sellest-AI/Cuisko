import { useConvexConnectionState } from "convex/react";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

import { OFFLINE_GRACE_MS } from "../constants";
import { isOfflineAtom } from "./atoms";

/**
 * Measures the connection for the whole app: `isOfflineAtom` turns true once the socket has been
 * down for `OFFLINE_GRACE_MS`, and false the moment it is back. On a cold start the grace runs from
 * mount, so a socket that never connected counts the same way.
 *
 * Called by `OfflineGate` alone, which is mounted for the life of the app. A second caller would
 * run a second timer writing the same atom.
 */
export const useWatchConnection = () => {
  const { isWebSocketConnected } = useConvexConnectionState();
  const setIsOffline = useSetAtom(isOfflineAtom);

  // Set from a timer either way, so nothing is set while the effect runs: down, after the grace;
  // back up, at once, which re-arms the grace for the next drop.
  useEffect(() => {
    const timer = setTimeout(
      () => setIsOffline(!isWebSocketConnected),
      isWebSocketConnected ? 0 : OFFLINE_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [isWebSocketConnected, setIsOffline]);
};
