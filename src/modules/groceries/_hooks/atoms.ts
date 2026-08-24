import { atom } from "jotai";

import { type Receipt } from "../_model/model";

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
