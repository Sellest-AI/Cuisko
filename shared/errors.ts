/**
 * Error codes carried by every `ConvexError` the backend throws.
 *
 * Lives in `shared/` because both runtimes need it: the backend to construct errors,
 * the client to branch on `error.data.code` instead of string-matching a message.
 */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "PAYMENT_REQUIRED",
  "EXTERNAL_SERVICE_ERROR",
  /**
   * A page we reached and could not read a recipe out of.
   *
   * Its own code rather than an `INVALID_INPUT`, because the two are different apologies and only
   * one of them should offer the paste form: `INVALID_INPUT` means "check what you pasted", this
   * means "your link is fine, the page is not one we can read". It is also not an
   * `EXTERNAL_SERVICE_ERROR` — nothing failed, and there is nothing to retry.
   */
  "UNREADABLE_PAGE",
  /**
   * A video platform answered, but not with the post data we read (`lib/socialVideo/`).
   *
   * Not `UNREADABLE_PAGE`: that blames the page, this blames us. Every post on the platform fails
   * the same way until the adapter is fixed, so the screen says the import is down, not that the
   * link is wrong.
   */
  "IMPORT_UNAVAILABLE",
  /** The post is a photo or a carousel without a video, so there is nothing to watch. */
  "NOT_A_VIDEO",
  /** The video was watched, and it teaches no dish (a restaurant visit, a taste test): nothing is saved. */
  "NOT_A_RECIPE",
  /** The video is larger than we download (`MAX_VIDEO_BYTES`, for TikTok). */
  "VIDEO_TOO_LARGE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppErrorData = {
  code: ErrorCode;
  message?: string;
};

/** Narrows an unknown caught value to our error payload. */
export const isAppError = (error: unknown): error is { data: AppErrorData } => {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("code" in data)) return false;
  return ERROR_CODES.includes((data as { code: ErrorCode }).code);
};

/**
 * The caller used up their allowance for an AI call (`enforceRateLimit`). The error carries
 * nothing else, on purpose: which limit it was and when it resets are for no one to read off the wire.
 */
export const isRateLimited = (error: unknown): boolean => isAppError(error) && error.data.code === "RATE_LIMITED";
