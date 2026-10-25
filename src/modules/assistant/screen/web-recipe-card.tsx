import type { WebRecipe } from "@shared/assistant";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Button } from "@ui/button";
import { CardRecipe } from "@ui/cards/recipe";
import { Check, Plus, X } from "@ui/icons";
import { Text } from "@ui/text";
import { theme } from "theme";

import { openInBrowser } from "~/lib/openInBrowser";
import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";
import { useImportWebRecipe } from "~/modules/recipes/hooks";

/** The site a page came from, as the card's source line credits it. */
const _SITES: Record<WebRecipe["source"], string> = { marmiton: "Marmiton" };

/** The title's length, in characters, past which the card cuts it, with an ellipsis. */
const _TITLE_MAX = 26;

type WebRecipeCardProps = {
  /** Drawn through `CardRecipe`: the page's photo or the placeholder, its title, the source line. */
  recipe: WebRecipe;
  state: "idle" | "importing" | "done" | "failed";
  /** Importing only: the share done, which the button shows as a percentage. */
  progress?: number;
  /** Failed only: the failure's title, under the button. It never names a wait. */
  errorText?: string;
  /** The button: Add, and Retry once it failed. */
  onAdd(): void;
  /** The card body: the recipe once added, else the page it came from. */
  onOpen(): void;
};

/**
 * A recipe Cuisko found on the web for a dish the catalog lacks, and the one action it offers.
 *
 * The card is the catalog cards' own, so a page found on the web and a recipe Cuisko already held
 * look like the same kind of thing. No rating badge: the catalog cards in the chat pass none, and a
 * Marmiton score there would read as Cuisko's.
 *
 * Under it, one button that changes with the import: Add, then "42% • Adding…" with no icon while
 * it imports (pressing does nothing then), then a check and "In your recipes" once it is there,
 * which opens it. A failed import shows a cross and Retry, with the failure's title under the
 * button. A lost import is still `importing`, held at 95 %, until the entry goes (`useImportWebRecipe`).
 *
 * @limitation "In your recipes" is what this app remembers adding, not what the cook holds: a
 * recipe deleted after its add leaves the card done, opening a recipe that is gone, and the page
 * cannot be added again from this card until the app restarts.
 */
export const WebRecipeCard = ({ recipe, state, progress, errorText, onAdd, onOpen }: WebRecipeCardProps) => {
  const t = useTranslations("Assistant");

  // By character, not UTF-16 unit, so an emoji is never cut in half.
  const characters = Array.from(recipe.title);
  const title = characters.length > _TITLE_MAX ? `${characters.slice(0, _TITLE_MAX).join("").trim()}…` : recipe.title;
  const subtitle = [
    _SITES[recipe.source],
    t("webRecipe.ingredients", { count: recipe.ingredients.length }),
  ].join(" • ");

  const button = (() => {
    switch (state) {
      case "importing":
        return { text: `${Math.round((progress ?? 0) * 100)}% • ${t("webRecipe.adding")}`, onPress: onAdd };
      // Done, Add again would save a second copy: the button opens the recipe, as the card does.
      case "done":
        return { icon: Check, text: t("webRecipe.added"), onPress: onOpen };
      case "failed":
        return { icon: X, text: t("webRecipe.retry"), onPress: onAdd };
      case "idle":
        return { icon: Plus, text: t("webRecipe.add"), onPress: onAdd };
    }
  })();

  const row = (
    <View style={styles.button}>
      <Button
        variant="neutral"
        leftIcon={button.icon}
        onPress={button.onPress}
        style={styles.add}
        isLoading={state === "importing"}
      >
        {button.text}
      </Button>
      {errorText && <Text.Base color={theme.colors.muted}>{errorText}</Text.Base>}
    </View>
  );

  return (
    <View style={styles.container}>
      <CardRecipe
        style={styles.card}
        title={title}
        subtitle={subtitle}
        imageSrc={recipe.imageUrl ? { uri: recipe.imageUrl } : COVER_PLACEHOLDER}
        onPress={onOpen}
      />
      {row}
    </View>
  );
};

/** The card as the chat draws it: wired to the import that adds its page to the cook's recipes. */
export const WebRecipeBlock = ({ recipe }: { recipe: WebRecipe }) => {
  const tRecipe = useTranslations("Recipe");
  const { start, status, recipeId, progress, failure } = useImportWebRecipe(recipe.url);

  return (
    <WebRecipeCard
      recipe={recipe}
      state={status}
      progress={progress}
      // The title alone: the bodies were written for the paste-a-link screen ("Check the link you pasted").
      errorText={failure && tRecipe(failure.title)}
      onAdd={start}
      onOpen={() => (recipeId ? router.push(`/recipe/${recipeId}`) : openInBrowser(recipe.url))}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[16],
    marginBottom: theme.spacing[12],
  },
  card: {
    alignSelf: "stretch",
    maxWidth: 232,
    width: "100%",
  },
  button: {
    alignItems: "flex-start",
    gap: theme.spacing[12],
  },
  add: {
    alignSelf: "flex-start",
  },
});
