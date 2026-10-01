import Constants from "expo-constants";

/**
 * The version in this build's `app.json`, which is the one the stores show.
 *
 * Sent to the backend so it can decide what this build may be told (`reviewWindow`). The client
 * never compares it with anything itself (ADR 0015). Missing reads as `"0.0.0"`, which is older than
 * any release and so opens nothing.
 */
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
