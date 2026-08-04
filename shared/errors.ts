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
