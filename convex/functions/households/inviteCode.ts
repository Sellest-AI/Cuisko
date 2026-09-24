import { ConvexError } from "convex/values";

import { nanoid } from "@convex/lib/nanoid";
import type { QueryCtx } from "@convex/procedures";

type CodeCtx = Pick<QueryCtx, "db">;

/**
 * What a code is drawn from: capitals and digits, less every glyph that reads as another one. I, L
 * and 1 are one stroke apart, and O and 0 are the same shape — a code read aloud across a kitchen,
 * or copied off a phone held at arm's length, has to survive being transcribed by eye.
 */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const INVITE_CODE_LENGTH = 8;

/**
 * How many draws before giving up. 31⁸ is about 8.5 × 10¹¹ codes, so a second draw is already a
 * rare event; the cap exists so a broken generator throws instead of spinning inside a mutation.
 */
const MAX_ATTEMPTS = 10;

/** The code as the index stores it: spaces dropped and upper-cased, so "h3k8 9p" finds "H3K89P". */
export const normalizeInviteCode = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

/** A code no household is using right now. */
export const generateInviteCode = async (ctx: CodeCtx): Promise<string> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = nanoid(INVITE_CODE_LENGTH, { alphabet: INVITE_CODE_ALPHABET });

    const taken = await ctx.db
      .query("households")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();

    if (!taken) return code;
  }

  throw new ConvexError({ code: "INVITE_CODE_EXHAUSTED" });
};
