import { useAtom, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";

import { isConversationStale } from "@shared/assistant";
import { localClock, localStamp } from "@shared/clock";
import { isRateLimited } from "@shared/errors";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction, useMutation } from "~/lib/convex/client";
import { useHousehold } from "~/modules/households/hooks";
import { useStagedPhoto } from "~/modules/navigation/hooks";

import { conversationAtom, cuiskoContextAtom, pendingQuestionAtom, refusalAtom } from "./atoms";

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
 *
 * @limitation A send that fails puts its photo back in the bar even if the cook has staged
 * another meanwhile, and the newer one is lost. **Accepted because** it needs a failed upload
 * during the seconds the cook spends taking a second photo. **Until fixed**, they take it again.
 * **The fix** is a token from `unstage` that `restore` checks, so it does nothing once anything
 * has been staged or discarded since.
 */
export const useAskCuisko = () => {
  const locale = useLocale();
  const { householdId } = useHousehold();
  const [conversation, setConversation] = useAtom(conversationAtom);
  const setPending = useSetAtom(pendingQuestionAtom);
  const setRefusal = useSetAtom(refusalAtom);
  const { mutate: send } = useMutation(api.router.assistant.sendMessage.authed);
  const { action: upload } = useAction(api.router.media.images.uploadOne.authed);
  const { unstage: unstagePhoto, restore: restorePhoto } = useStagedPhoto();

  /**
   * What the open assistant was given beside the question (`useCuiskoContext`), read when the
   * question goes rather than when this rendered: the screen's first question leaves from a mount
   * effect, before a render could have picked the context up.
   */
  const readContext = useAtomCallback(useCallback((get) => get(cuiskoContextAtom), []));

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      /**
       * No household yet means no cellar to answer from — it resolves before any screen that can
       * send is usable, so this only closes the gap of the first frames after sign-in.
       */
      if (!question || !householdId || _inFlight) return;

      _inFlight = true;
      /** Taken as the question is asked, before the upload: what was open is what it was asked in. */
      const { recipe } = readContext();
      /**
       * The photo leaves the bar now, and the pending bubble shows it in its place: it would
       * otherwise sit in the bar until the question lands. Unstaged rather than discarded, so its
       * compression keeps running for the upload below, and put back if the send fails.
       */
      const photo = unstagePhoto();
      setPending({ text: question, image: photo?.uri });

      /**
       * The thread is offered only while it is still warm. The server makes the same judgement in
       * `openThread` and its answer is the one that counts — this just avoids asking to continue a
       * conversation the client has already stopped drawing.
       */
      const warm =
        conversation && !isConversationStale(conversation.lastActivityAt, Date.now())
          ? conversation.threadId
          : undefined;

      let base64: string | undefined;
      try {
        /**
         * The photo goes with this question. It was compressed when it was taken, so this waits for
         * nothing unless the cook was quicker than the compression. Uploaded before anything is
         * sent: a failed upload throws first, and the catch below puts the photo back.
         */
        base64 = await photo?.base64;
        const imageId = base64 ? (await upload({ base64, tags: ["IMAGE"] })).imageId : undefined;

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
        const sentAt = new Date();
        const { threadId } = await send({
          text: question,
          imageId,
          recipe,
          threadId: warm,
          locale,
          householdId,
          today: localClock(sentAt).today,
          now: localStamp(sentAt),
        });

        setConversation({ threadId, lastActivityAt: Date.now() });
      } catch (error) {
        // A refusal for asking too much is said in the transcript. Anything else
        // is logged rather than surfaced: the question left no message on screen and no spinner
        // running, so retyping it is the obvious move.
        if (isRateLimited(error)) setRefusal({ at: Date.now() });
        else console.error("Cuisko could not take the question", error);
        setPending(undefined);
        if (photo && base64) restorePhoto(photo.uri, base64);
      } finally {
        _inFlight = false;
      }
    },
    [conversation, householdId, locale, readContext, restorePhoto, send, setConversation, setPending, setRefusal, unstagePhoto, upload],
  );

  return { ask };
};
