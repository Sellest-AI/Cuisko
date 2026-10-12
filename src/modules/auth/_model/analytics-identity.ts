/** What analytics has to do so its person is the cook signed in on this device, and nobody else. */
export type IdentityStep = "none" | "identify" | "reset" | "reset-and-identify";

/**
 * The step that brings analytics in line with who is signed in.
 *
 * `distinctId` is who analytics currently attributes events to, and `anonymousId` the visitor id it
 * minted for this device: the two are equal until an `identify`, so a difference means a cook is
 * held. `userId` is the signed-in cook's `users` id, the same id the backend records costs under, or
 * `null` when nobody is signed in.
 *
 * **A different cook is reset before being identified**, never identified over. Identifying B while
 * A is held sends A's visitor id along with B, which asks analytics to merge the two people.
 * A session that ended while the app was closed leaves A held on the next launch, so this compares
 * against what analytics holds rather than against what this run last saw.
 */
export const identityStep = ({
  userId,
  distinctId,
  anonymousId,
}: {
  userId: string | null;
  distinctId: string;
  anonymousId: string;
}): IdentityStep => {
  const holdsCook = distinctId !== anonymousId;

  if (userId === null) return holdsCook ? "reset" : "none";
  if (distinctId === userId) return "none";

  return holdsCook ? "reset-and-identify" : "identify";
};
