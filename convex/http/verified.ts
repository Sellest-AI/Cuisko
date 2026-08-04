import { type ActionCtx, httpAction } from "@convex/procedures";

/**
 * The only place `httpAction` may be called (lint R5 enforces it).
 *
 * `verify` has NO default and no optional escape. A webhook literally cannot be defined
 * without one, which is the difference between "we verify our webhooks" as a policy and as a
 * fact — the predecessor project shipped three unauthenticated webhooks under the policy.
 *
 * The raw body is read FIRST and passed to `verify` unparsed: HMAC signatures cover the exact
 * bytes sent, and `JSON.parse` + re-stringify does not reproduce them.
 */
export const verifiedWebhook = <T>(opts: {
  /** Throws ⇒ 401. Receives the request and the raw, unparsed body. */
  verify: (request: Request, rawBody: string) => Promise<void>;
  /** Throws ⇒ 400. */
  parse: (json: unknown) => T;
  handle: (ctx: ActionCtx, body: T) => Promise<Response>;
}) =>
  httpAction(async (ctx, request) => {
    const raw = await request.text();

    try {
      await opts.verify(request, raw);
    } catch {
      // Deliberately opaque: a verification failure must not tell the caller why.
      return new Response("Unauthorized", { status: 401 });
    }

    let body: T;
    try {
      body = opts.parse(JSON.parse(raw));
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    return opts.handle(ctx, body);
  });
