import { isAppError, isRateLimited } from "@shared/errors";

import type { ImportPath } from "./importPath";

/**
 * Which apology an import failure is, as translation keys under `Recipe`.
 *
 * Shared by the paste-a-link screen and the share sheet, because a failed import is the same event
 * whichever door the link came through. Each code gets its own sentence only where there is
 * something different to say; anything else (an outage, a bug, a code nobody here has heard of) is
 * worded as the site not answering, the honest reading from the phone, with the same way out.
 *
 * The limit is the exception to "we cannot tell them": the cook can be told exactly what happened.
 * It names no wait, which is not ours to hand to someone probing it.
 *
 * `INVALID_INPUT` means two things depending on the path: a web link that is not a web address, and
 * a video link from an app we cannot read yet. Hence `path`.
 */
export const IMPORT_FAILURES = {
  invalid: { title: "Import.invalid_title", body: "Import.invalid_body" },
  unsupported: { title: "Import.unsupported_title", body: "Import.unsupported_body" },
  unreadable: { title: "Import.unreadable_title", body: "Import.unreadable_body" },
  unreachable: { title: "Import.unreachable_title", body: "Import.unreachable_body" },
  limited: { title: "Import.limited_title", body: "Import.limited_body" },
  notVideo: { title: "Import.not_video_title", body: "Import.not_video_body" },
  notRecipe: { title: "Import.not_recipe_title", body: "Import.not_recipe_body" },
  notFound: { title: "Import.not_found_title", body: "Import.not_found_body" },
  unavailable: { title: "Import.unavailable_title", body: "Import.unavailable_body" },
  tooLarge: { title: "Import.too_large_title", body: "Import.too_large_body" },
  scrapeLost: { title: "Import.scrape_lost_title", body: "Import.scrape_lost_body" },
} as const;

export type ImportFailure = (typeof IMPORT_FAILURES)[keyof typeof IMPORT_FAILURES];

/**
 * Whether the Convex client dropped the call on reconnect rather than the server failing it.
 *
 * Leaving the app drops the socket, and on the way back the client rejects every action still in
 * flight, since an action is never sent twice. The server keeps going, so the import may still land.
 * The client throws a plain `Error` with no code, so its message is the only signal.
 */
export const isConnectionLost = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("Connection lost while action was in flight");

/**
 * A scrape the connection dropped, when the phone itself was to send the save that follows it.
 *
 * Unlike a lost call that saves (`isConnectionLost`), nothing can land: the draft the server read
 * never reached the phone, so no save was sent. It is a failure, worded as the connection, never as
 * the site. Told apart by its tag, not its message, and `isConnectionLost` is false for it, so
 * `startImport` settles it at once rather than holding it as `lost`.
 */
export type ScrapeLost = Error & { scrapeLost: true };

export const scrapeLost = (): ScrapeLost =>
  Object.assign(new Error("The scrape was dropped with the connection, before its save was sent"), {
    scrapeLost: true as const,
  });

export const isScrapeLost = (error: unknown): error is ScrapeLost =>
  error instanceof Error && "scrapeLost" in error && error.scrapeLost === true;

export const importFailureOf = (error: unknown, path: ImportPath = "web"): ImportFailure | undefined => {
  if (error === null || error === undefined) return undefined;
  if (isScrapeLost(error)) return IMPORT_FAILURES.scrapeLost;
  if (isRateLimited(error)) return IMPORT_FAILURES.limited;
  if (!isAppError(error)) return IMPORT_FAILURES.unreachable;

  switch (error.data.code) {
    case "INVALID_INPUT":
      return path === "video" ? IMPORT_FAILURES.unsupported : IMPORT_FAILURES.invalid;
    case "UNREADABLE_PAGE":
      return IMPORT_FAILURES.unreadable;
    case "NOT_A_VIDEO":
      return IMPORT_FAILURES.notVideo;
    case "NOT_A_RECIPE":
      return IMPORT_FAILURES.notRecipe;
    case "NOT_FOUND":
      return IMPORT_FAILURES.notFound;
    case "IMPORT_UNAVAILABLE":
      return IMPORT_FAILURES.unavailable;
    case "VIDEO_TOO_LARGE":
      return IMPORT_FAILURES.tooLarge;
    default:
      return IMPORT_FAILURES.unreachable;
  }
};
