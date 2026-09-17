import { ConvexError } from "convex/values";
import { router } from "expo-router";
import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";

import { httpUrlOf } from "@shared/urls";

import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

import { importedDraftAtom } from "./atoms";

/**
 * `idle` and `failed` both mean the screen is answerable again; they differ only in whether there
 * is something to say about why. There is no `done`: success leaves this screen entirely, so the
 * state it would describe never gets rendered.
 */
type Status = "idle" | "importing" | "failed";

/**
 * Reading a recipe off a page the cook found, and handing it to the editor.
 *
 * **No loading screen, deliberately.** Saving in the editor gets one because a sanitize agent runs
 * for something like fifteen seconds while reporting nothing. The import runs none of that: it is
 * one fetch and one parse, so it either lands in a couple of seconds or hits the fetch timeout. A
 * disabled button with a spinner says everything true about that wait.
 *
 * **It navigates on success, and nothing has been written yet.** The draft goes into
 * `importedDraftAtom` and the editor seeds itself from it, so what the cook lands on is a form they
 * can correct rather than a row they now have to go and fix. `replace` rather than `push`, so Back
 * from the editor returns to where they were rather than to an import screen they have finished
 * with.
 */
export const useImportRecipe = () => {
  const { action } = useAction(api.router.recipes.importOne.authed);
  const setImportedDraft = useSetAtom(importedDraftAtom);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<unknown>(null);

  const importFrom = useCallback(
    async (url: string) => {
      /**
       * One import at a time, guarded here rather than by whoever drew the button. A second call
       * before the first resolves would fetch the page twice and race two `replace` calls for the
       * route. The screen disables its input, but this hook is the module's public API and the next
       * screen to call it should inherit the guarantee rather than have to remember the discipline.
       */
      if (status === "importing") return;

      /**
       * Refused here, before the round trip, because the answer is already knowable. The action
       * checks again — a client is not a gate — and this is the arm that makes the refusal
       * instant. The shape is a real `ConvexError` so the screen has exactly ONE error shape to
       * read, whichever side of the wire refused.
       */
      const target = httpUrlOf(url);
      if (!target) {
        setError(new ConvexError({ code: "INVALID_INPUT" as const, message: "Not a web address" }));
        setStatus("failed");

        return;
      }

      setError(null);
      setStatus("importing");

      try {
        const draft = await action({ url: target });

        setImportedDraft(draft);
        setStatus("idle");
        router.replace("/recipe/new");
      } catch (caught) {
        setError(caught);
        setStatus("failed");
      }
    },
    [action, setImportedDraft, status],
  );

  return { importFrom, isImporting: status === "importing", error };
};
