/**
 * How long a purchase stays take-back-able.
 *
 * In `shared/` rather than in the groceries module because both halves of the app now measure by
 * it: the client holds the receipt and stops offering the undo when it lapses, and the server
 * re-links a plan's ledger claims when a purchase is given back — where age is how claims *this*
 * purchase settled are told apart from claims an older, kept purchase left anchored to the same
 * lot. One number in one place, or the two drift and the undo quietly stops re-linking.
 *
 * What the window governs is the purchase behind the stock: inside, the receipt is still on the
 * books, so the row is drawn as reversible and giving the stock back also gives back any line the
 * purchase struck off. Outside, the purchase has settled — putting stock back is the shopper using
 * what they bought, not unmaking the trip, and their list stays as they left it.
 */
export const UNDO_WINDOW_MS = 5 * 60 * 1000;
