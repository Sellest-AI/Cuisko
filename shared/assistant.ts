/**
 * Where one conversation with Cuisko stops and the next one begins.
 *
 * Shared rather than declared on either side, because both sides ask the same question and a
 * disagreement between them is invisible: the server would continue a thread the screen had already
 * stopped drawing, and the shopper's next question would land under a conversation they cannot see.
 */

/**
 * Idle longer than this and the next message opens a NEW thread.
 *
 * Nothing is deleted when it elapses — the old thread keeps every message it ever had. A shopper who
 * comes back an hour later has moved on, and their next question should not be answered in the
 * context of a lunch they already cooked.
 *
 * Fifteen minutes is the gap between "I put the phone down to check the fridge" and "I came back to
 * this later". The first must not lose its context; the second must not inherit one.
 */
export const ASSISTANT_IDLE_MS = 15 * 60 * 1000;

/**
 * Whether a conversation last touched at `lastActivityAt` has gone cold by `now`.
 *
 * `now` is passed in rather than read here so this stays pure — it is the same comparison on the
 * server, where the clock is the deployment's, and on the client, where it is the phone's.
 *
 * The boundary belongs to the cold side: exactly fifteen minutes is stale. Either rule is
 * defensible and only one of them can be true, so the test pins it.
 */
export const isConversationStale = (lastActivityAt: number, now: number): boolean =>
  now - lastActivityAt >= ASSISTANT_IDLE_MS;
