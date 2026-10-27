import { atom } from "jotai";

/**
 * Whether the socket has been down for the grace period, measured once for the whole app.
 *
 * Written by `useWatchConnection`, which only `OfflineGate` calls, and read everywhere else through
 * `useConnection`. A timer per reader would start its grace from that reader's own mount, so a
 * header mounted while offline would act online for the first two seconds.
 */
export const isOfflineAtom = atom(false);
