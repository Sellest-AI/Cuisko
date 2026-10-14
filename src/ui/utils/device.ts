import { Platform } from "react-native";

/** The first Android API level whose layout animations are trusted (Android 13). */
export const MIN_ANIMATED_ANDROID_API = 33;

/** The first iOS major version whose layout animations are trusted. */
export const MIN_ANIMATED_IOS_MAJOR = 26;

/**
 * Whether a device is too old to be given layout animations.
 *
 * Android reports its API level as a number, iOS its version as text ("18.2"), so only the major
 * part of the iOS one is read. Any other platform, and a version that cannot be read, counts as
 * current: being treated as old costs the animations, not anything the reader needs.
 */
export const isOldDevice = (os: string, version: string | number): boolean => {
  if (os === "android") return Number(version) < MIN_ANIMATED_ANDROID_API;
  if (os === "ios") return Number.parseInt(String(version), 10) < MIN_ANIMATED_IOS_MAJOR;

  return false;
};

/**
 * The device this runs on, read once: neither its OS nor its version changes while the app runs.
 */
export const IS_OLD_DEVICE = isOldDevice(Platform.OS, Platform.Version);
