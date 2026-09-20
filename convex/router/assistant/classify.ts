import { classifyIntent } from "@convex/functions/assistant/classifyIntent";
import { authActionI18n } from "@convex/procedures";
import { vIntent } from "@convex/schema/assistantPayloads";
import { type Infer, v } from "convex/values";

/**
 * Free text the navigation bar could only guess at → what the shopper meant.
 *
 * `authed` rather than `anon` for the reason `router/ingredients/resolve.ts` gives: it spends money
 * on a third party, so the caller has a name attached. It takes no document id, so ADR 0003's
 * ownership question does not arise — and it is a bare action rather than a mutation scheduling one
 * because the client AWAITS the answer to know which screen to open. Nothing is written either way.
 *
 * `authActionI18n` and not `authAction`: the judgment is locale-sensitive — the model is told which
 * language it is reading, because "pas de viande pour ma bolognaise" and an English phrase of the
 * same shape are not judged by the same grammar. The wrapper takes `locale` as an argument and folds
 * it into `ctx.i18n`, which is right here: what matters is the language the app is displaying, and
 * that is the client's to state.
 *
 * The return type is `Infer<typeof vIntent>` rather than `Intent`, which is what pins the validator
 * to the union it mirrors — see `schema/assistantPayloads.ts`.
 */
export const authed = authActionI18n({
  args: { text: v.string() },
  returns: vIntent,
  handler: (ctx, { text }): Promise<Infer<typeof vIntent>> =>
    classifyIntent({ text, locale: ctx.i18n.locale }),
});
