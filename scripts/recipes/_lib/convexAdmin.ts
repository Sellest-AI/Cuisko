/**
 * A Convex client that can call `_internal` functions from this machine, through a deploy key.
 *
 * Not `npx convex run`: its arguments travel on the command line, which Windows caps at about
 * 32,000 characters, and the restore script sends photos in base64. The HTTP client has no such
 * limit.
 */
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * The deployment a deploy key belongs to, as the ledger records it ("dev:happy-otter-123"), checked
 * against the URL the client will call.
 *
 * The key names the deployment and the URL does not carry that name in a fixed form (a region can
 * sit between the name and the domain), so the two come from separate variables. A prod key with
 * the dev URL would record prod imports that never happened, so a mismatch refuses to run.
 */
export const deploymentOf = (deployKey: string, url: string): string => {
  const match = /^(dev|prod):([a-z0-9-]+)\|/.exec(deployKey);
  if (!match) {
    throw new Error("CONVEX_DEPLOY_KEY does not start with dev:<name>| or prod:<name>|");
  }

  const [, kind, name] = match;
  if (!new URL(url).hostname.startsWith(`${name}.`)) {
    throw new Error(`The deploy key is for ${kind}:${name}, but the URL is ${url}. Set CONVEX_URL to its URL.`);
  }

  return `${kind}:${name}`;
};

type InternalAction = FunctionReference<"action", "internal">;

export type ConvexAdmin = {
  /** Where every call lands, as the ledger records it. */
  deployment: string;
  action: <Action extends InternalAction>(
    action: Action,
    args: FunctionArgs<Action>,
  ) => Promise<FunctionReturnType<Action>>;
};

/**
 * A client for the deployment named by `CONVEX_DEPLOY_KEY`, at `CONVEX_URL`, or at
 * `EXPO_PUBLIC_CONVEX_URL` when that is the same deployment (dev, usually).
 */
export const connectAdmin = (): ConvexAdmin => {
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  const url = process.env.CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!deployKey || !url) {
    throw new Error(
      "Set CONVEX_DEPLOY_KEY in .env.catalog (dashboard → Settings → Deploy keys), " +
        "and CONVEX_URL when the key is not for EXPO_PUBLIC_CONVEX_URL's deployment",
    );
  }

  const deployment = deploymentOf(deployKey, url);

  // Cast once, here. `setAdminAuth` is what `npx convex run` authenticates with and exists at
  // runtime, but the package's declarations leave it out, as they type `action` for public
  // functions only. With an admin key, the server accepts internal ones.
  const client = new ConvexHttpClient(url) as unknown as {
    setAdminAuth: (token: string) => void;
    action: (action: InternalAction, args: unknown) => Promise<unknown>;
  };
  client.setAdminAuth(deployKey);

  return {
    deployment,
    action: async (action, args) => (await client.action(action, args)) as FunctionReturnType<typeof action>,
  };
};
