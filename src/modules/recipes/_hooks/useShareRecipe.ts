import { useCallback } from "react";
import { Platform, Share } from "react-native";

import { useTranslations } from "translations";

import { api, type Id } from "~/lib/convex/api";
import { useMutation } from "~/lib/convex/client";

import { recipeLink } from "../routes";

/**
 * The share button on the recipe screen: the OS share sheet with the recipe's link, then the
 * `recipe shared` event once the sheet says it went out.
 *
 * The payload is split by platform so the link appears once on each. iOS gets the link as `url`,
 * which Messages draws as a card, and the title as `message`; apps reading both would print the
 * link twice if it were in the text too. Android ignores `url`, so its link rides inside `message`.
 *
 * Nothing here is shown to the cook when it fails: a sheet that cannot open and an event that
 * cannot be recorded are neither something they can act on. Both are logged.
 *
 * @limitation Android's sheet resolves `sharedAction` whatever the cook did, so a cancel there is
 * recorded as a share. **Accepted because** the OS gives no other signal. **Until fixed**, Android
 * share counts run high; iOS ones, which resolve `dismissedAction` on a cancel, do not.
 */
export const useShareRecipe = () => {
  const t = useTranslations("Recipe");
  const { mutate } = useMutation(api.router.recipes.recordShare.authed);

  const share = useCallback(
    async ({ id, title }: { id: string; title: string }) => {
      const url = recipeLink(id);
      const text = t("Chrome.share_message_x_title", { title });

      try {
        const result = await Share.share(
          Platform.OS === "ios"
            ? { message: text, url }
            : { title: text, message: t("Chrome.share_message_x_title_x_url", { title, url }) },
        );
        if (result.action !== Share.sharedAction) return;

        await mutate({ id: id as Id<"recipes"> });
      } catch (cause) {
        console.error("[recipes] share failed", cause);
      }
    },
    [mutate, t],
  );

  return { share };
};
