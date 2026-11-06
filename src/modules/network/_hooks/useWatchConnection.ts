import { useConvexConnectionState } from "convex/react";
import { useSetAtom } from "jotai";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { OFFLINE_GRACE_MS } from "../constants";
import { isOfflineAtom } from "./atoms";

const _subscribeToAppState = (onChange: () => void) => {
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
};

const _isInBackground = () => AppState.currentState === "background";

/** The static web render has no app to leave. */
const _isInBackgroundOnServer = () => false;

/**
 * Measures the connection for the whole app: `isOfflineAtom` turns true once the socket has been
 * down for `OFFLINE_GRACE_MS`, and false the moment it is back. On a cold start in the foreground
 * the grace runs from mount, so a socket that never connected counts the same way.
 *
 * The background does not count: the OS drops the socket there, and a timer started then runs out
 * before the cook is back, leaving no grace for the reconnect. So the grace of a socket down in the
 * background starts on the return. A reading already offline when the app left stands.
 *
 * Called by `OfflineGate` alone, which is mounted for the life of the app. A second caller would
 * run a second timer writing the same atom.
 */
export const useWatchConnection = () => {
  const { isWebSocketConnected } = useConvexConnectionState();
  const setIsOffline = useSetAtom(isOfflineAtom);
  const isInBackground = useSyncExternalStore(_subscribeToAppState, _isInBackground, _isInBackgroundOnServer);

  // Set from a timer either way, so nothing is set while the effect runs: down, after the grace;
  // back up, at once, which re-arms the grace for the next drop.
  useEffect(() => {
    if (isInBackground && !isWebSocketConnected) return;

    const timer = setTimeout(
      () => setIsOffline(!isWebSocketConnected),
      isWebSocketConnected ? 0 : OFFLINE_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [isWebSocketConnected, isInBackground, setIsOffline]);
};
