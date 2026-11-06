import * as StoreReview from "expo-store-review";
import { createMMKV } from "react-native-mmkv";

/**
 * iOS shows the system's review sheet at most 3 times a year and ignores every other request. A
 * week planned and a recipe imported happen far more often than that, so without this spacing a
 * new cook would see all 3 in their first days, and nothing again until next year.
 */
const COOLDOWN_MS = 122 * 24 * 60 * 60_000;

/** The ask comes after the route change, once the cook sees what they just made. */
const SETTLE_MS = 1_500;

const LAST_ASKED_AT = "lastAskedAt";

/** Its own store: `convex-device-cache` is cleared on sign-out, and the system's limit is the device's. */
const storage = createMMKV({ id: "store-review" });

/** An ask waiting out `SETTLE_MS`, so that two successes in that time make one. Memory only. */
let _isPending = false;

const _isCoolingDown = () => {
  const lastAskedAt = storage.getNumber(LAST_ASKED_AT);

  return lastAskedAt !== undefined && Date.now() - lastAskedAt < COOLDOWN_MS;
};

/**
 * `isAvailableAsync` is false on web and in TestFlight, and on Android without the Play Store.
 *
 * The time is written after the request, so only a request that went out starts the wait. An app
 * killed during `SETTLE_MS`, or a request that failed (on iOS, the app left the foreground), leaves
 * the next success free to ask.
 */
const _request = async () => {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      storage.set(LAST_ASKED_AT, Date.now());
    }
  } catch (error) {
    if (__DEV__) console.warn("[askForReview] could not ask", error);
  } finally {
    _isPending = false;
  }
};

/**
 * Asks the store for its review sheet, after something the cook wanted to do has just worked.
 *
 * Call it once the write has landed. It returns at once and never throws: its callers run it inside
 * the `try` that reports their write, and a store that fails here must not report a write that
 * landed as a failed one.
 *
 * Whether a sheet appears is the system's decision, and it says nothing either way: a call here
 * only makes one possible. Android also shows none on a build not installed from the Play Store.
 */
export const askForReview = () => {
  try {
    if (_isPending || _isCoolingDown()) return;

    _isPending = true;
    setTimeout(() => void _request(), SETTLE_MS);
  } catch (error) {
    if (__DEV__) console.warn("[askForReview] the store failed", error);
  }
};
