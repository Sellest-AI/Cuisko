/**
 * Speech in, one line of text out: the recognizer's hook, and the rules a spoken entry follows.
 *
 * A barrel, so callers import `~/lib/voice` whichever half they need. The hook imports the rules by
 * relative path (`./voice`), never through here, or the two would import each other (C9).
 */
export * from "./voice";
export { useVoiceInput } from "./useVoiceInput";
