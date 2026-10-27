import { getFunctionName, type FunctionReference } from "convex/server";
import * as Updates from "expo-updates";
import { createMMKV } from "react-native-mmkv";

import { APP_VERSION } from "~/lib/appVersion";

/**
 * The last answer of a query, kept on the device so a cold start draws before any round trip. An
 * entry whose key left loose args out is served whatever those args were (`DeviceOptions.loose`).
 */
export type DeviceEntry = { data: unknown };

/**
 * One store for every device-cached query. MMKV reads synchronously, which is what lets a hook read
 * its entry while it renders; on web it falls back to `localStorage` by itself.
 */
const storage = createMMKV({ id: "convex-device-cache" });

/**
 * The identity of the running JS bundle, not `APP_VERSION`: an OTA update ships new mapping code
 * under the same store version, and must never read the answers the previous bundle stored.
 *
 * @limitation A bundle with no update id (a dev build on Metro, the web) is keyed by `APP_VERSION`
 * alone. **Accepted because** neither reaches a cook: there is no web release, and a dev build's
 * bundle changes with every save. **Until fixed**, a query whose shape changes within one version
 * is read once in its old shape, until the live answer replaces it. **The fix**, once the web ships,
 * is a build id inlined at export (`EXPO_PUBLIC_*`) in place of the version.
 */
const BUNDLE_ID = Updates.updateId ? `${Updates.runtimeVersion}+${Updates.updateId}` : `unidentified+${APP_VERSION}`;
const PREFIX = `${BUNDLE_ID}|`;

/**
 * Top-level keys sorted, so `{ from, to }` and `{ to, from }` are one entry. Nested values keep
 * their order: an id list in another order is another question.
 */
const stableStringify = (args: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))));

/**
 * The key of a query's entry: one per (query, strict args). `loose` args are left out, so a moving
 * window or a growing id list overwrites its entry instead of adding one.
 */
export const deviceKey = (
  query: FunctionReference<"query">,
  args: Record<string, unknown>,
  loose: readonly string[] = [],
) => {
  const strict = Object.fromEntries(Object.entries(args).filter(([name]) => !loose.includes(name)));
  return `${PREFIX}${getFunctionName(query)}|${stableStringify(strict)}`;
};

/** Synchronous. A stored value that no longer parses is dropped and read as a miss. */
export const readDevice = (key: string): DeviceEntry | undefined => {
  const raw = storage.getString(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as DeviceEntry;
  } catch (error) {
    console.warn("[deviceCache] dropping an entry that does not parse", key, error);
    storage.remove(key);
    return undefined;
  }
};

/** Skips the write when the stored JSON is the same: most live answers repeat the last one. */
export const writeDevice = (key: string, entry: DeviceEntry) => {
  const raw = JSON.stringify(entry);
  if (storage.getString(key) !== raw) storage.set(key, raw);
};

export const deleteDevice = (key: string) => {
  storage.remove(key);
};

/** Removes what earlier bundles stored. Run once, when this module loads. */
export const pruneOtherBundles = () => {
  for (const key of storage.getAllKeys()) if (!key.startsWith(PREFIX)) storage.remove(key);
};

/** Every entry, whatever its bundle: a session that ends leaves nothing of its cook on disk. */
export const clearDeviceCache = () => {
  storage.clearAll();
};

pruneOtherBundles();
