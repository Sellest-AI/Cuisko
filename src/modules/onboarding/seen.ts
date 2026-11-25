import { createMMKV } from "react-native-mmkv";

const SEEN = "seen";

/**
 * Its own store: `convex-device-cache` is cleared on sign-out, which is what this has to outlive.
 * None during a server render, where MMKV throws on any access (see `deviceCache`).
 */
const storage = typeof window === "undefined" ? undefined : createMMKV({ id: "onboarding" });

/**
 * Whether this device is done with the onboarding: it was walked to its end here, or someone has
 * been signed in here. With no session, such a device opens on the sign-in, and any other on the
 * onboarding. Read synchronously, so `AuthGate` decides its first frame on it.
 *
 * On the device and not on the account, because nobody is signed in when it is read. A reinstall
 * forgets it, which is why the onboarding's first step offers the sign-in.
 */
export const isOnboardingSeen = (): boolean => storage?.getBoolean(SEEN) ?? false;

export const markOnboardingSeen = (): void => storage?.set(SEEN, true);
