import { toUIMessages, useThreadMessages } from "@convex-dev/agent/react";
import { useAtom } from "jotai";
import { useEffect, useLayoutEffect, useMemo } from "react";

import { isConversationStale } from "@shared/assistant";

import { api } from "~/lib/convex/api";

import { type ChatMessage, isShowingSomething, toChatMessages } from "../_model/chatMessage";
import { conversationAtom, pendingQuestionAtom } from "./atoms";
import { useAskCuisko } from "./useAskCuisko";

/** Enough to fill the sheet on the first frame; the rest paginates in as the reader scrolls up. */
const INITIAL_MESSAGES = 20;

/**
 * The conversation the assistant screen is written against: what to draw, and how to add to it.
 *
 * **The screen's whole Convex surface is here** (ADR 0006), and it matters more than usual, because
 * the wiring underneath is the fiddly part — a paginated query that also carries stream deltas, an
 * agent SDK adapter, and a thread id the server is allowed to overrule.
 *
 * **The stale check runs when the screen mounts, not on a timer.** No interval and nothing watching
 * the clock: the question "has this conversation gone cold" only changes anything at the moment
 * somebody opens the modal or sends something. A timer would fire while nobody is looking and
 * reach the same conclusion. A conversation therefore never vanishes from under a reader who is
 * sitting on it, which is the right behaviour as well as the cheap one.
 *
 * The server makes the same comparison in `openThread` and its answer is the one that counts. This
 * one exists so the modal does not OPEN on a dead conversation — without it, a shopper returning an
 * hour later reads yesterday's exchange and watches it vanish the moment they type.
 */
export const useAssistantChat = () => {
  const [conversation, setConversation] = useAtom(conversationAtom);
  const [pendingQuestion, setPending] = useAtom(pendingQuestionAtom);
  const { ask } = useAskCuisko();

  /**
   * A conversation that has gone cold is dropped before anything is drawn.
   *
   * **A layout effect and not a `useMemo`, for two separate reasons.** Reading the clock during a
   * render is impure — the same render would produce different answers at different moments, which
   * is what `react-hooks/purity` refuses — and a memo would freeze the verdict at whatever the
   * clock said when `conversation` last changed, so "check on read" would quietly become "check
   * once". Clearing the atom instead makes the decision real: there is no held conversation
   * afterwards, rather than one every reader has to remember to ignore.
   *
   * `useLayoutEffect` rather than `useEffect` so it lands before the frame is painted. The
   * difference is visible exactly once, and it is the moment that matters: reopening the modal
   * after an hour must not show yesterday's exchange for a frame and then blank it.
   *
   * It cannot loop — clearing sets the atom to `undefined`, and `undefined` fails the guard.
   */
  useLayoutEffect(() => {
    if (conversation && isConversationStale(conversation.lastActivityAt, Date.now())) {
      setConversation(undefined);
    }
  }, [conversation, setConversation]);

  const stored = useThreadMessages(
    api.router.assistant.listMessages.authed,
    conversation ? { threadId: conversation.threadId } : "skip",
    { initialNumItems: INITIAL_MESSAGES, stream: true },
  );

  const messages: ChatMessage[] = useMemo(
    () => toChatMessages(toUIMessages(stored.results ?? [])),
    [stored.results],
  );

  /**
   * The question in flight has appeared in the transcript.
   *
   * **Found by its text, not guessed at from the newest message.** The transcript is the only
   * thing that can answer this, and the obvious shortcut — "the newest message is an answer" — is
   * already true the instant a follow-up is sent, because the previous answer is still the newest
   * message. That shortcut cleared the pending state in the same commit it was set.
   *
   * Searching from the end because the match is almost always the last message or nearly so, and
   * because someone who asks the same question twice means the most recent one.
   */
  const hasLanded = useMemo(
    () =>
      pendingQuestion !== undefined &&
      messages.some((message) => message.from === "user" && message.text === pendingQuestion),
    [messages, pendingQuestion],
  );

  /**
   * The turn is over, one way or another: the answer is showing something, or it failed outright.
   *
   * **Showing, not merely started.** The answer's message exists, empty and streaming, before the
   * model has produced a word or called a tool; counting that as answered would blank "Cuisko is
   * thinking" and leave nothing on screen until the first status line or token. A status line
   * counts: "🔍 searching recipes" is the answer beginning.
   *
   * The failure arm is not defensive padding. A turn that throws before its first token leaves a
   * failed message and nothing else, so waiting for an ANSWER would wait forever — and because
   * the pending state is module-level Jotai, "forever" outlives closing the modal.
   */
  const last = messages.at(-1);
  const isAnswered =
    hasLanded &&
    last?.from === "assistant" &&
    (isShowingSomething(last) || last.hasFailed);

  useEffect(() => {
    if (isAnswered) setPending(undefined);
  }, [isAnswered, setPending]);

  /**
   * The client's idle window is measured from the same instant the server measures it from.
   *
   * **The newest message's own timestamp, never `Date.now()`.** Stamping the local clock made
   * merely REOPENING the modal look like activity: the client would count from the moment you
   * looked, the server from the last real message, and reopening every ten minutes kept a
   * transcript on screen that `openThread` would then refuse to continue — the next question
   * silently starting a new thread and the visible history disappearing. Both sides now read the
   * same number.
   *
   * **The dependencies are the id and that timestamp, never `conversation` itself.**
   * `setConversation` writes a new object, so depending on the object would re-run the effect that
   * wrote it — an infinite render loop, and one that only appears once a conversation exists. A
   * string and a number both settle, and the write is skipped when nothing moved.
   */
  const threadId = conversation?.threadId;
  const lastMessageAt = last?.createdAt;
  const heldActivityAt = conversation?.lastActivityAt;

  useEffect(() => {
    if (!threadId || lastMessageAt === undefined || lastMessageAt === heldActivityAt) return;

    setConversation({ threadId, lastActivityAt: lastMessageAt });
  }, [threadId, lastMessageAt, heldActivityAt, setConversation]);

  /**
   * The rows the screen draws: the transcript without an answer that has nothing on screen yet.
   *
   * That answer stays in `messages`, where the checks above need it, but drawn it is an empty row
   * plus the gap above it, which pushed "Cuisko is thinking" down and back up as the first token
   * landed. A failed one stays: it draws its apology.
   */
  const drawn = useMemo(
    () => messages.filter((message) => message.from === "user" || isShowingSomething(message) || message.hasFailed),
    [messages],
  );

  return {
    messages: drawn,
    ask,
    /**
     * A thread is being read, so an empty `messages` means "not loaded yet", not "nothing here".
     *
     * The screen needs the two apart: without a conversation the query is skipped and empty is
     * final, while with one the first page is still in flight and drawing a greeting over it
     * would flash a welcome at somebody who is mid-conversation.
     */
    hasConversation: conversation !== undefined,
    /**
     * The question is in and nothing has come back yet — the screen draws Cuisko thinking.
     *
     * True from the moment it is sent, through the gap before it appears in the transcript, until
     * an answer starts or the turn fails.
     */
    isThinking: pendingQuestion !== undefined && !isAnswered,
    /**
     * The answer has started and its turn is not over yet: Cuisko may still write or show more.
     *
     * Takes over from `isThinking` once the answer shows something, so exactly one of the two is
     * true while a turn runs and the cook can always tell whether it has finished.
     */
    isReplying: last?.from === "assistant" && last.isReplying && isShowingSomething(last),
    loadMore: stored.loadMore,
    canLoadMore: stored.status === "CanLoadMore",
  };
};
