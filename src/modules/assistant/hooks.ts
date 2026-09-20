/**
 * The assistant hooks other modules may call.
 *
 * One, deliberately. The navigation bar is the only input this feature has — there is no text box
 * inside the assistant screen — so it must be able to put a question to Cuisko from wherever the
 * shopper is standing. It takes `useAskCuisko` and not `useAssistantChat`: the bar sends and never
 * draws, and the fuller hook carries a paginated message subscription that would then be live
 * behind every page in the app.
 */
export { useAskCuisko } from "./_hooks/useAskCuisko";
