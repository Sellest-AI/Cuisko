import { View, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";

import { Popover } from "@ui/popover";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { ButtonIcon } from "@ui/button-icon";
import {
  BugOffIcon,
  CalendarPlus,
  CalendarPlusIcon,
  Ellipsis,
  ExternalLinkIcon,
  Heart,
  Share2,
  Share2Icon,
  SquarePen,
  SquarePenIcon,
} from "@ui/icons";
import { theme } from "theme";
import { useTranslations } from "translations";

import type { Id } from "~/lib/convex/api";
import { openInBrowser } from "~/lib/openInBrowser";

import { useSetRecipeFavorite } from "../../_hooks/useSetRecipeFavorite";
import { useShareRecipe } from "../../_hooks/useShareRecipe";
import { useVerifyRecipe } from "../../_hooks/useVerifyRecipe";
import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING } from "../../constants";

type Props = {
  /** The recipe the heart, the pencil and the share act on. Absent only before the route parameter has arrived. */
  recipeId?: string;
  /** From the `getOne` payload. The share message names it; absent until the recipe has arrived. */
  title?: string;
  /** From the `getOne` payload. The pencil renders only when this is exactly true. */
  isOwned?: boolean;
  /** From the `getOne` payload. Drives the heart's variant; absent until the recipe has arrived. */
  isFavorited?: boolean;
  /** From the `getOne` payload, which ships it only to the owner and to an admin. */
  sourceUrl?: string;
};

/**
 * What sits on top of the recipe photo: the planning action on one corner, the recipe's own
 * actions (edit, share, favorite) on the other.
 *
 * Both rows are absolutely positioned against a fixed-height box rather than laid out in flow,
 * because the parallax header scales and translates this whole view as the page scrolls — a flow
 * layout would reflow under the transform instead of moving with it.
 *
 * It takes the title and the two flags rather than fetching them. The chrome above it already holds
 * the recipe, and this view is re-rendered by the parallax on every scroll frame — a subscription
 * here would be a second reader of one cache entry for data its parent had in hand. The favorite,
 * share and verify WRITES are called from here, though: a mutation is not a subscription, and each
 * control is the only thing that sends its own.
 *
 * The `…` menu holds what only some cooks may do: edit for the author, the original page for the
 * author and an admin (the only ones the server ships it to), the check against it for an admin.
 * When it would hold only Edit, which the pencil already offers, the button is not drawn. The
 * check's bar and its results stay at the bottom of the overview (`overview/verify.tsx`), which
 * reads the same entry.
 */
export const RecipeHeader = ({ recipeId, title, isOwned, isFavorited, sourceUrl }: Props) => {
  const t = useTranslations("Recipe");
  const { set } = useSetRecipeFavorite();
  const { share } = useShareRecipe();
  const { canVerify, isVerifying, verify } = useVerifyRecipe(recipeId);

  /** Guarded on the title: the message names the recipe, and a link with no name reads as spam. */
  const onShare = recipeId && title ? () => share({ id: recipeId, title }) : undefined;

  /**
   * Guarded on the flag having arrived, not only on the id: before the payload lands there is no
   * state to send the opposite of, and a tap then would favorite or unfavorite at random.
   */
  const onHeart =
    recipeId && isFavorited !== undefined
      ? () => set(recipeId as Id<"recipes">, !isFavorited)
      : undefined;

  const canEdit = recipeId !== undefined && isOwned === true;
  const hasMenu = sourceUrl !== undefined || (recipeId !== undefined && canVerify);

  return (
    <View style={styles.header}>
      <View style={[styles.actions, styles.leftActions]}>
        <ButtonIcon
          onPress={() => router.push({ pathname: "/plan-recipe", params: { recipeId } })}
          variant="primary"
          elevated
          size="sm"
        >
          {CalendarPlus}
        </ButtonIcon>
      </View>
      <View style={[styles.actions, styles.rightActions]}>
        {/*
          * Only the author gets the pencil. The read no longer proves ownership, and offering to
          * edit a recipe whose save `updateOne` will refuse is a form the cook cannot submit. A
          * recipe with an original page shows the `…` menu, which then holds Edit, so the pencil
          * steps aside for it rather than offering the same thing twice.
          */}
        {recipeId && isOwned === true && !sourceUrl && (
          <ButtonIcon
            onPress={() => router.push(`/recipe/edit/${recipeId}`)}
            variant="neutral"
            size="sm"
          >
            {SquarePen}
          </ButtonIcon>
        )}
        {/*
          * Anyone may share, not only the author: a recipe is readable by any signed-in cook
          * (ADR 0014), and the link opens it for them.
          */}
        <ButtonIcon onPress={onShare} disabled={onShare === undefined} variant="neutral" size="sm">
          {Share2}
        </ButtonIcon>
        {/*
          * The kept state is the brand disc, not `danger`: that variant is documented as
          * destructive and is the only place in the app that fills a control with red.
          */}
        <ButtonIcon
          onPress={onHeart}
          haptic
          disabled={onHeart === undefined}
          variant={isFavorited ? "primary" : "neutral"}
          size="sm"
        >
          {Heart}
        </ButtonIcon>
        {hasMenu && (
          <Popover
            minWidth={232}
            trigger={(open, isOpen) => (
              <ButtonIcon
                onPress={open}
                haptic
                disabled={isOpen}
                variant="neutral"
                size="sm"
                accessibilityLabel={t("Chrome.more")}
              >
                {Ellipsis}
              </ButtonIcon>
            )}
          >
            {/*
              * Every row closes the sheet, and hands its action over to run once it is gone: the
              * editor and the in-app browser each present over the screen, never over the Modal.
              */}
            {(close) => (
              <View style={styles.popover}>
                {canEdit && (
                  <Pressable
                    style={styles.popoverItem}
                    onPress={() => close(() => router.push(`/recipe/edit/${recipeId}`))}
                  >
                    <SquarePenIcon size={22} />
                    <Text.Base>{t("Chrome.menu_edit")}</Text.Base>
                  </Pressable>
                )}
                {recipeId && (
                  <Pressable
                    style={styles.popoverItem}
                    onPress={() => close(() => router.push({ pathname: "/plan-recipe", params: { recipeId } }))}
                  >
                    <CalendarPlusIcon size={22} />
                    <Text.Base>{t("Chrome.menu_plan")}</Text.Base>
                  </Pressable>
                )}
                {sourceUrl !== undefined && (
                  <Pressable
                    style={styles.popoverItem}
                    /**
                     * Three platforms, three orders. Android opens once the sheet is gone. iOS opens
                     * at once and leaves the sheet up: the browser crashes if the Modal is dismissed
                     * under it too quickly. Web opens inside the tap itself, since a browser blocks a
                     * tab opened after the gesture has ended, and only then closes.
                     */
                    onPress={() => {
                      if (Platform.OS === "android")
                        close(() => openInBrowser(sourceUrl));
                      else {
                        openInBrowser(sourceUrl);
                        if (Platform.OS !== "ios") close();
                      }
                    }}
                  >
                    <ExternalLinkIcon size={22} />
                    <Text.Base>{t("Chrome.menu_source")}</Text.Base>
                  </Pressable>
                )}
                {onShare && (
                  <Pressable
                    style={styles.popoverItem}
                    onPress={async () => {
                      await onShare();
                      close();
                    }}
                  >
                    <Share2Icon size={22} />
                    <Text.Base>{t("Chrome.menu_share")}</Text.Base>
                  </Pressable>
                )}
                {/*
                  * A running check keeps its row, disabled and saying so, rather than vanishing:
                  * the bar is at the bottom of the overview, out of sight from up here.
                  */}
                {recipeId !== undefined && canVerify && (
                  <Pressable
                    style={styles.popoverItem}
                    disabled={isVerifying}
                    onPress={() => close(() => void verify())}
                  >
                    <BugOffIcon size={22} />
                    <Text.Base>
                      {t(isVerifying ? "Chrome.menu_verifying" : "Chrome.menu_verify")}
                    </Text.Base>
                  </Pressable>
                )}
              </View>
            )}
          </Popover>
        )}
      </View>
    </View>
  );
};

/** Tall enough for the photo to read as a photo before the content starts covering it. */
const HEADER_HEIGHT = 240;

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    padding: SCREEN_PADDING,
    paddingBottom: SCREEN_PADDING + CONTENT_NEGATIVE_SPACE,
  },
  actions: {
    position: "absolute",
    top: SCREEN_PADDING / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  rightActions: {
    right: SCREEN_PADDING,
    justifyContent: "flex-end",
  },
  leftActions: {
    left: SCREEN_PADDING,
    justifyContent: "flex-start",
  },
  popover: {
    paddingVertical: theme.spacing[16],
    paddingHorizontal: theme.spacing[20],
    gap: theme.spacing[24],
  },
  popoverItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[20],
  }
});
