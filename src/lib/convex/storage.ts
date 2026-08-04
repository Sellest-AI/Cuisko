import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { env } from "env";

/**
 * Where the Convex Auth session lives: Keychain / Keystore on native, localStorage on web.
 *
 * `clear()` is the reason this is a module rather than an inline object. Signing out has to
 * remove the refresh token too, and @convex-dev/auth derives its storage keys from the
 * deployment URL — so the names have to be reconstructed exactly, and getting them wrong leaves
 * a stale refresh token that silently signs the next user back in.
 */
const DEPLOYMENT_KEY = env.EXPO_PUBLIC_CONVEX_URL.replace(/(^\w+:|^)\/\//, "").replace(/\./g, "");

const CONVEX_KEYS = [
  `__convexAuthJWT_${DEPLOYMENT_KEY}`,
  `__convexAuthRefreshToken_${DEPLOYMENT_KEY}`,
] as const;

const isWeb = Platform.OS === "web";

export const convexAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return isWeb ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
    } catch (error) {
      // Never swallowed: a storage read failing means the user silently appears signed out,
      // and without this line there is nothing to explain why.
      console.error(`[convexAuthStorage] read "${key}" failed:`, error);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (isWeb) return localStorage.setItem(key, value);
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`[convexAuthStorage] write "${key}" failed:`, error);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (isWeb) return localStorage.removeItem(key);
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`[convexAuthStorage] delete "${key}" failed:`, error);
    }
  },

  /** Removes every key Convex Auth owns — both the JWT and the refresh token. */
  clear: async (): Promise<void> => {
    try {
      if (isWeb) {
        CONVEX_KEYS.forEach((key) => localStorage.removeItem(key));
        return;
      }
      await Promise.all(CONVEX_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
    } catch (error) {
      console.error("[convexAuthStorage] clear failed:", error);
    }
  },
};
