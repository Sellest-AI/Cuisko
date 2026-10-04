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
} as const;

export type ImportFailure = (typeof IMPORT_FAILURES)[keyof typeof IMPORT_FAILURES];

export const importFailureOf = (error: unknown, path: ImportPath = "web"): ImportFailure | undefined => {
  if (error === null || error === undefined) return undefined;
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
