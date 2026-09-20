import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";

import { isConversationStale } from "@shared/assistant";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";

import { conversationAtom, pendingQuestionAtom } from "./atoms";

/**
 * Whether a send is currently in flight, shared by every caller in the app.
 *
 * **A module-level variable rather than an atom or a ref, and both alternatives are wrong for the
 * same reason: this guard has to be readable in the same tick it is written.** A ref is per-hook-
 * instance, and `useAskCuisko` is mounted twice on the assistant screen — once by the navigation
 * bar and once by the screen's own hook — so two simultaneous first sends would each see their own
 * untouched ref, both find no thread, and open two conversations. One of them would then hold a
 * question and an answer that nothing ever displays again. An atom is shared but settles
 * asynchronously, so both callers could still read `false` before either write landed.
 *
 * It is reset in a `finally`, so a failed send does not wedge it.
 */
let _inFlight = false;

/**
 * Putting a question to Cuisko — and nothing else.
 *
 * **Split from `useAssistantChat` because the navigation bar sends without reading.** The bar is
 * the only input this feature has, so it must be able to ask from any screen; subscribing it to a
 * paginated message query it never draws would put a live subscription behind every page in the
 * app to support a button. This hook holds no query at all.
 *
 * The state it does touch is shared (`atoms.ts`), which is what lets the bar send a question and
 * the assistant screen show the answer arriving, with no component tree joining the two.
 */
export const useAskCuisko = () => {
  const locale = useLocale();
  const [conversation, setConversation] = useAtom(conversationAtom);
  const setPending = useSetAtom(pendingQuestionAtom);
  const { mutate: send } = useMutation(api.router.assistant.sendMessage.authed);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || _inFlight) return;

      _inFlight = true;
      setPending(question);

      /**
       * The thread is offered only while it is still warm. The server makes the same judgement in
       * `openThread` and its answer is the one that counts — this just avoids asking to continue a
       * conversation the client has already stopped drawing.
       */
      const warm =
        conversation && !isConversationStale(conversation.lastActivityAt, Date.now())
          ? conversation.threadId
          : undefined;

      try {
        /**
         * The id that comes back is the one actually written to, which is not always the one sent:
         * `openThread` overrules a cold thread, a thread that is not the caller's, and one that no
         * longer exists. Storing the answer rather than the request is what keeps this pointing at
         * the conversation the server is appending to.
         *
         * `lastActivityAt` is the phone's clock here, and only here — this is the one instant the
         * client knows about before any message exists to read a server timestamp off. Every later
         * update takes the server's, so the two clocks converge as soon as the question lands.
         */
        const { threadId } = await send({ text: question, threadId: warm, locale });

        setConversation({ threadId, lastActivityAt: Date.now() });
      } catch (error) {
        // Logged rather than surfaced: the question left no message on screen and no spinner
        // running, so retyping it is the obvious move. When this screen has somewhere to put an
        // error, it goes here.
        console.error("Cuisko could not take the question", error);
        setPending(undefined);
      } finally {
        _inFlight = false;
      }
    },
    [conversation, locale, send, setConversation, setPending],
  );

  return { ask };
};
