/**
 * The seed a generated avatar is drawn from.
 *
 * A cook's face has to be the same everywhere it appears — the home header and the chef credit on
 * any recipe they wrote — so it is derived from the one thing about them that never changes: their
 * user id. Deriving it from the name instead would redraw somebody's face when they corrected a
 * typo in it, and would hand two cooks called "Franck" the same one.
 *
 * **Only the server calls this.** Both payloads that carry a seed compute it before they ship, and
 * the client never runs it. The client and the Convex deployment version independently — an OTA
 * update landing before a backend deploy, or after it — and two callers on two schedules is exactly
 * how the same cook ends up with one face on the home screen and a different one on their own
 * recipe, on some devices and not others. One producer, so the skew has nowhere to express itself.
 */

/**
 * A 32-bit FNV-1a pass over the string, offset so that four passes give four independent words.
 *
 * `Math.imul` rather than `*` because the multiply has to wrap at 32 bits: a plain multiply here
 * silently exceeds `Number.MAX_SAFE_INTEGER` a few characters in and the low bits stop being the
 * ones FNV specifies.
 */
const _word = (value: string, offset: number): number => {
  let hash = 0x811c9dc5 ^ offset;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

/**
 * A stable, opaque seed for one user.
 *
 * Four words rather than one, hex-joined into 32 characters: a single 32-bit hash collides at a few
 * tens of thousands of users by the birthday bound, and a collision here is two cooks wearing the
 * same face — the precise thing seeding by id rather than by name was meant to fix.
 *
 * Not a security primitive, and not doing any work that one would do. What keeps a user id off the
 * client is that the id is not in the payload; this only makes sure the seed that *is* in the
 * payload is not the id spelled differently.
 */
export const avatarSeed = (userId: string): string =>
  [0, 1, 2, 3].map((offset) => _word(userId, offset).toString(16).padStart(8, "0")).join("");

/**
 * The one face every uncredited recipe wears.
 *
 * Deliberately not derived from anything: a recipe with no owner, or an owner with no name, has no
 * identity to draw from, and inventing one per render would give the same recipe a different face
 * on every visit. Non-hex, so it cannot collide with `avatarSeed`'s output however many users
 * exist — that is a property of the alphabet, not of luck, and `avatars.test.ts` pins it.
 */
export const ANONYMOUS_AVATAR_SEED = "anonymous-cook";
