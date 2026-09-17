import { router } from "expo-router";
import { useCallback, useState } from "react";
import type { FunctionArgs } from "convex/server";

import { useLocale } from "~/hooks/useLocale";
import { api } from "~/lib/convex/api";
import { useAction } from "~/lib/convex/client";

/** Everything the editor collected. The locale is the hook's to add, not the screen's to know. */
export type RecipeDraft = Omit<
  FunctionArgs<typeof api.router.recipes.createOne.authed>,
  "locale"
>;

/**
 * `idle` and `failed` both mean the editor is answerable again; they differ only in whether there
 * is something to say about why. `done` is the moment between the recipe existing and the screen
 * changing — the overlay must not lift during it, or the form flashes back before the route does.
 */
type Status = "idle" | "creating" | "done" | "failed";

/**
 * A field left blank is a field not answered, not a field answered with nothing.
 *
 * It matters for `title` in particular: absent, the agent words one from the recipe, and `""` would
 * instead store a recipe whose name is the empty string — a card with a blank line where its title
 * goes. Applied here rather than at the call site because it is a property of the draft, and a
 * screen that has to remember it is a screen that will eventually forget.
 */
const _omitBlank = (value?: string) => value?.trim() || undefined;

/**
 * Writing the recipe, and the wait that comes with it.
 *
 * The action is a single `await` on an agent that reports nothing, so this hook reports nothing
 * either: only whether the write is running, and why it failed. What the cook watches meanwhile is
 * the screen's business, and makes no claim about how far along the agent is.
 *
 * **It navigates on success, and that is deliberate.** `createOne` schedules the translation rather
 * than awaiting it, so the id comes back with the recipe existing in one language only — there is
 * nothing left to wait for and nothing for the editor to decide. `replace` rather than `push`, so
 * Back returns to the list and not to a form that has already been submitted.
 *
 * A failure leaves the cook on their own typed text with nothing lost. That is also why the overlay
 * covers the editor rather than replacing it, and why there is no `creating` route.
 */
export const useCreateRecipe = () => {
  const locale = useLocale();
  const { action } = useAction(api.router.recipes.createOne.authed);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<unknown>(null);

  const create = useCallback(
    async (draft: RecipeDraft) => {
      /**
       * One write at a time, guarded here rather than by whoever drew the button.
       *
       * A second call before the first resolves would run the sanitize agent twice, leaving the cook two copies of one recipe and
       * two `replace` calls racing for the route. The editor disables its actions, but this hook is
       * the module's public API and the next screen to call it should inherit the guarantee rather
       * than have to remember the discipline.
       */
      if (status === "creating") return;

      setError(null);
      setStatus("creating");

      try {
        const recipeId = await action({
          ...draft,
          title: _omitBlank(draft.title),
          description: _omitBlank(draft.description),
          locale,
        });

        setStatus("done");
        router.replace(`/recipe/${recipeId}`);
      } catch (caught) {
        setError(caught);
        setStatus("failed");
      }
    },
    [action, locale, status],
  );

  return {
    create,
    /** `done` counts: the recipe exists, but the editor is still the thing on screen. */
    isCreating: status === "creating" || status === "done",
    error,
  };
};
