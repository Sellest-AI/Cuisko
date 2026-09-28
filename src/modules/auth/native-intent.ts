import { routeForIncomingLink } from "./_model/oauth-return";

/**
 * Expo Router's hook on every link that opens the app, cold or warm, before it becomes a route:
 * `app/+native-intent.tsx` re-exports it, and the rule itself is `routeForIncomingLink`'s.
 */
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }) => routeForIncomingLink(path);
