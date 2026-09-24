import type { Id } from "@convex/_generated/dataModel";
import { resolvei18n } from "@convex/lib/i18n";
import type { QueryCtx } from "@convex/procedures";
import { stockUnitOf, type StockUnit } from "@shared/ingredients";
import type { Locale } from "@shared/translations";
import { ConvexError } from "convex/values";

import { availableStock } from "../planning/availableStock";

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** `localStamp`'s shape. Checked because it is client text that lands verbatim in a prompt. */
const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/**
 * Whether a stamp's parts name a real day and time — the shape alone lets `2026-13-45T25:99`
 * through. A date that does not survive a round trip through `Date` is not a date: February 30th
 * parses, but rolls over to March.
 */
const _isRealStamp = (date: string, time: string) => {
  const [hours = NaN, minutes = NaN] = time.split(":").map(Number);
  const parsed = Date.parse(`${date}T00:00:00Z`);

  return hours < 24 && minutes < 60 && !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(date);
};

type Args = {
  householdId: Id<"households">;
  locale: Locale;
  /** The cook's local midnight (`Clock.today`): what planned meals reserve from, and what expiry counts from. */
  today: number;
  /** The cook's wall clock, `YYYY-MM-DDTHH:mm` (`localStamp`). */
  now: string;
};

type Line = { id: Id<"ingredients">; name: string; amount: number; unit: StockUnit; expiresIn?: number };

/** Whole grams and millilitres, pieces to a tenth — a third of a loaf is a real answer, 0.4 g is not. */
const _round = (amount: number, unit: StockUnit) =>
  unit === "pcs" ? Math.round(amount * 10) / 10 : Math.round(amount);

/** A calendar day `days` after `date`, as `YYYY-MM-DD`. UTC arithmetic on a date that carries no offset. */
const _addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const _expiry = (date: string, days: number) => {
  const when =
    days === 0 ? "today"
    : days === 1 ? "tomorrow"
    : days === -1 ? "yesterday"
    : days > 0 ? `in ${days} days`
    : `${-days} days ago`;
  return `, expires ${_addDays(date, days)} (${when})`;
};

/**
 * The text appended to the cook's question before Cuisko reads it: what the household can still
 * cook with, then the cook's date and hour, last.
 *
 * **Available stock, not the raw cellar.** A lot already reserved by a planned meal is not on
 * offer: an assistant suggesting tonight's bolognaise with Thursday's beef would undo the plan the
 * cook just made. `availableStock` is the one answer to "what is left" (ADR 0015), so this reads it
 * rather than subtracting reservations a second time. An ingredient with nothing left is dropped —
 * including one whose lots cannot convert to its stock unit, which `availableStock` counts as 0.
 *
 * **Appended to the question, never to the system prompt** — see `appendBrief` for the caching
 * trade. So everything here that changes between turns lives here, and the date sits at the very
 * end: it is the part that changes every minute.
 *
 * Ids are carried so a later tool can be handed an ingredient without resolving a name. They are
 * context, never something the model is asked to produce (ADR 0010).
 */
export const turnBrief = async (ctx: QueryCtx, { householdId, locale, today, now }: Args): Promise<string> => {
  const [, date, time] = STAMP.exec(now) ?? [];
  if (!date || !time || !_isRealStamp(date, time)) throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid local time." });

  const [stock, lots] = await Promise.all([
    availableStock(ctx, householdId, today),
    ctx.db
      .query("cellarItems")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
  ]);

  /**
   * The soonest date any held lot of an ingredient goes off — the one that decides what to cook first.
   *
   * ⚠️ Taken over every lot, including one a planned meal will drain first (`consumeFromCellar`'s
   * `_drainOrder`), so the date can belong to stock the plan has set aside. Dormant while nothing
   * writes `expirationDate`; the exact answer drains reservations through that same order.
   */
  const expiries = new Map<Id<"ingredients">, number>();
  for (const lot of lots) {
    if (lot.quantity <= 0 || lot.expirationDate === undefined) continue;
    expiries.set(lot.ingredientId, Math.min(expiries.get(lot.ingredientId) ?? Infinity, lot.expirationDate));
  }

  const lines = (
    await Promise.all(
      [...stock].map(async ([id, left]): Promise<Line | undefined> => {
        const ingredient = await ctx.db.get(id);
        if (!ingredient) return undefined;

        const unit = stockUnitOf(ingredient.defaultUnit);
        const amount = _round(left, unit);
        if (amount <= 0) return undefined;

        const expiry = expiries.get(id);
        const expiresIn = expiry === undefined ? undefined : Math.round((expiry - today) / DAY_MS);

        return { id, name: resolvei18n(ingredient.name, locale), amount, unit, expiresIn };
      }),
    )
  )
    .filter((line) => line !== undefined)
    .sort((a, b) => (a.expiresIn ?? Infinity) - (b.expiresIn ?? Infinity) || a.name.localeCompare(b.name, locale));

  const cellar = lines.length
    ? lines
        .map(({ id, name, amount, unit, expiresIn }) =>
          `- ${name} (id: ${id}): ${amount} ${unit}${expiresIn === undefined ? "" : _expiry(date, expiresIn)}`,
        )
        .join("\n")
    : "empty";

  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

  return `<cellar>\n${cellar}\n</cellar>\n<now>${weekday} ${date} ${time}</now>`;
};
