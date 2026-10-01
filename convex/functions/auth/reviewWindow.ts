import { compareVersions } from "../../lib/compareVersions";
import { REVIEW_ACCOUNT } from "./reviewAccount";

export type ReviewAccount = { email: string; password: string };

/** The part of `appConfig` the window reads. `reviewVersion` is the build submitted to a store. */
export type ReviewConfig = { liveVersion: string; reviewVersion?: string };

/**
 * The shared review account's credentials, if this caller is allowed to see them right now.
 *
 * A build in review is, by definition, newer than the one in the stores. So the window is open
 * only while `reviewVersion` is ahead of `liveVersion`, and only to a build that is at least the
 * one in review. Releasing means setting `liveVersion` to it, which shuts the window with no
 * second step to forget.
 *
 * `callerVersion` is whatever the client says it is, so this is a speed bump rather than a lock:
 * what keeps the account safe is that the window is closed in steady state and that the account
 * is an ordinary user. A version that does not parse closes the window — never the reverse.
 */
export const reviewWindow = (config: ReviewConfig | null, callerVersion: string): ReviewAccount | null => {
  if (!config?.reviewVersion) return null;
  if (compareVersions(config.reviewVersion, config.liveVersion) !== 1) return null;
  const caller = compareVersions(callerVersion, config.reviewVersion);
  if (caller === null || caller < 0) return null;

  return { ...REVIEW_ACCOUNT };
};
