import { useConvexConnectionState } from "convex/react";
import { useAtomValue } from "jotai";

import { isOfflineAtom } from "./atoms";

/**
 * The Convex socket, read as the app's connection: no NetInfo, because the socket is what the data
 * comes through, and a network the phone calls connected can still fail to reach it.
 *
 * `isOffline` is the app-wide reading `useWatchConnection` keeps, so every screen turns offline at
 * the same moment. `isConnected` is the socket as it is now, for what must act the moment it is
 * back. The socket is read as down too while `useWatchConnection` has not caught up, so a reader
 * never sees offline over a live socket.
 */
export const useConnection = () => {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const isOffline = useAtomValue(isOfflineAtom);

  return {
    isConnected: isWebSocketConnected,
    hasEverConnected,
    isOffline: isOffline && !isWebSocketConnected,
  };
};
