import { atom } from "jotai";

import type { Refusal } from "../_model/chatMessage";

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

/** A question on its way: the words, and the photo that goes with them as a LOCAL file, if there is one. */
export type PendingQuestion = { text: string, image?: string };

/**
 * The question that has been sent but has not yet appeared in the transcript.
 *
 * **It is also what the screen draws in that gap**, as the cook's own bubble, so a question never
 * sits unseen while the photo compresses and uploads. The photo is the local file, which is already
 * on the phone; the stored message swaps in the uploaded one when it lands.
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
export const pendingQuestionAtom = atom<PendingQuestion | undefined>(undefined);

/**
 * The latest refusal, drawn in the transcript where it happened.
 *
 * **An atom with a timestamp rather than a flag or an error, because it is part of the
 * conversation.** The refused question was never stored, so there is nothing in the transcript to
 * hang the explanation on; `at` is what slots the notice between the messages either side of it
 * (`withRefusal`), and it keeps its place once later questions land beneath it. Same reason as
 * `pendingQuestionAtom`: the navigation bar sends and the assistant screen draws, and no component
 * tree joins them.
 *
 * Only the latest is held, and it is dropped once it is older than the idle window, like the
 * conversation it belongs to (`useAssistantChat`). Never persisted.
 */
export const refusalAtom = atom<Refusal | undefined>(undefined);

/**
 * Cuisko is on a turn: thinking, or still writing its answer.
 *
 * **Written by `useAssistantChat`, read by the navigation bar** — the screen is the one that reads
 * the transcript and so the only one that can tell, and the bar is what listens again once the turn
 * is over. Published rather than recomputed in the bar, which would need the paginated message
 * subscription `useAskCuisko` exists to keep out of it.
 */
export const isAnsweringAtom = atom(false);

/**
 * What has been undone of each change Cuisko made, by the change's key (its message and tool call):
 * for a cellar change, indexes into its `lines`; for a planned plate, `[0]`, the one line it has.
 *
 * **Jotai and not `useState`, because the card unmounts every time the modal closes.** Held in the
 * component, an undone change offered its undo again on reopening, and undoing a removal twice puts
 * the stock back twice.
 *
 * **A plain atom and not a `householdAtom`, deliberately.** A household switch resets those, and
 * this must survive it: the conversation does (`conversationAtom`), so the undone change is still
 * on screen when the cook switches back, and an emptied atom would offer its undo again. Each change
 * names the household it wrote to, so nothing here can land on the wrong cellar or week.
 *
 * Like the conversation, it is never persisted: killing the app forgets it, and a change whose rows
 * were emptied by its undo still reads as done, from the cellar (`useCellarChange`) or the week
 * (`usePlannedMeal`).
 */
export const undoneChangesAtom = atom<Readonly<Record<string, readonly number[]>>>({});
