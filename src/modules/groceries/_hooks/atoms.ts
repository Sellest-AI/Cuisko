import { atom } from "jotai";

import { type PendingIngredient, type Receipt } from "../_model/model";

/**
 * The one set in this domain that is not in the database.
 *
 * Everything else — the list, the cellar, what the household has bought before — is a household
 * fact and lives in Convex, where a second device sees it and a reload does not lose it. A receipt
 * is not that. It answers "what did the purchase I just made strike off", which is a question
 * about the last five minutes of *this* session, and it exists so a mistap at the till can be
 * taken back by its exact amount.
 *
 * Jotai rather than component state because two screens read it: the grid and the quantity modal,
 * which is a route of its own and so cannot be handed props down a tree.
 *
 * **The trade, deliberately:** undo does not survive a reload and never reaches a second device.
 * It fails closed — no receipts means no undo badge, which is honest, since the undo genuinely is
 * not available. Deriving the badge from `updatedAt` instead would draw a badge that lies. Making
 * it durable later is adding a `receipts` table and moving `peelReceipts` behind it; the band
 * logic and its tests do not change, only where they run.
 */
export const receiptsAtom = atom<Receipt[]>([]);

/**
 * The ingredients the catalog does not hold yet, while the server works out what they are.
 *
 * The second set in this domain that is not in the database, and it is not one for the same reason
 * `receiptsAtom` is not: nothing here is a household fact yet. A ghost is the shopper's typing
 * plus a promise in flight — "yuzu" exists on this device, in this session, until
 * `resolve.authed` turns it into a row every device can see. The moment it does, the ghost is
 * dropped and the real grocery line takes its place, which is a Convex fact and reactive.
 *
 * Jotai rather than component state because the bar mints the ghost and the list draws it, and
 * they are different routes.
 *
 * **The trade, deliberately:** a ghost does not reach the other person in the household, and it
 * does not survive a reload — close the app mid-resolve and the item is gone from the screen with
 * no trace. The row it was resolving into may well have been created; what is lost is the line on
 * the list, because that write happens after the resolve returns and there is nobody left to make
 * it. Two people typing the same unknown food at once resolve independently, and step 1 of the
 * action (the widened catalog search) is the only thing stopping that becoming two rows — which is
 * more defence than a provisional row would have given, since a provisional row IS the second row.
 *
 * Making it durable later is a `pendingIngredients` table and reading the ghost from it:
 * `usePendingIngredients` changes, and nothing that draws a ghost does.
 */
export const pendingIngredientsAtom = atom<PendingIngredient[]>([]);
