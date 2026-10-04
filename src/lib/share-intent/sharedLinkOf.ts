import { httpUrlOf } from "@shared/urls";

/** The two fields of a share this app reads, as `expo-share-intent` types them. */
export type SharedContent = { webUrl: string | null; text?: string | null };

/**
 * The link a share carries, or `null` when it carries none. Pure, so it is testable without the
 * native module; the share itself is read by `useOnSharedLink` (`src/hooks/`).
 *
 * `webUrl` first: the platform's own pick, when it found one. Otherwise the shared text, which some
 * apps send as a sentence around the link ("Check out this video! https://vm.tiktok.com/…"), read by
 * `httpUrlOf`, the same reading every import applies. Text with no link opens nothing.
 */
export const sharedLinkOf = ({ webUrl, text }: SharedContent): string | null =>
  httpUrlOf(webUrl ?? "") ?? httpUrlOf(text ?? "") ?? null;
