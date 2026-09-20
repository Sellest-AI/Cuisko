import { atom } from "jotai";

/** The conversation the shopper is in, and when anything last happened in it. */
export type Conversation = {
  threadId: string;
  /**
   * The last time a message was sent or received, by this phone's clock.
   *
   * Stored beside the id rather than read off the loaded messages, and that is the whole reason
   * this is an object instead of a string. The screen has to decide whether to draw a held
   * conversation on its FIRST frame — before any query has resolved — and a timestamp it already
   * holds answers that immediately. Deriving it from the messages means showing yesterday's
   * exchange and then clearing it a beat later, which is worse than either outcome.
   */
  lastActivityAt: number;
};

/**
 * The conversation open in the assistant modal, for as long as the app is running.
 *
 * **Jotai and not a route param, because the modal is opened from several places and closed
 * constantly.** Someone asks a question, taps a recipe card, comes back — that is a full
 * unmount and remount of the screen, and component state would lose the thread every time.
 *
 * **Jotai and not storage, deliberately.** It is never persisted, so killing the app ends the
 * conversation on this device. The thread itself survives on the server, whole and untouched;
 * what is thrown away is only the pointer to it. That is the intended shape: a conversation is
 * something you are currently having, not something you come back to a day later.
 *
 * `undefined` means there is no conversation — nothing sent yet, or the last one aged out of
 * `ASSISTANT_IDLE_MS` and `useAssistantChat` cleared it. The screen draws those two identically,
 * and it should: both are an assistant with nothing to say yet.
 */
export const conversationAtom = atom<Conversation | undefined>(undefined);

/**
 * The question that has been sent but has not yet appeared in the transcript.
 *
 * Shared state rather than `useState` inside the hook, because the two halves of that moment
 * happen in different components: the navigation bar sends the question, and the assistant screen
 * is what draws "Cuisko is thinking". They are siblings with no tree between them, so a local flag
 * in the sender would leave the reader with a silent gap and no explanation for it.
 *
 * **The text and not a boolean, and that is the fix for a bug a flag could not express.** The only
 * thing that can say whether a question has landed is finding it in the transcript. A flag had to
 * be cleared on a guess instead — "the newest message is an answer" — which is already true the
 * instant a FOLLOW-UP is sent, because the previous answer is still the newest message. The flag
 * cleared itself in the same commit it was set, and the thinking indicator never appeared again
 * after the first question of a conversation.
 *
 * `undefined` means nothing is in flight.
 */
export const pendingQuestionAtom = atom<string | undefined>(undefined);
