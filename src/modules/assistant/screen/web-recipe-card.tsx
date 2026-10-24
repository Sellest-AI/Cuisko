import type { WebRecipe } from "@shared/assistant";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { Button } from "@ui/button";
import { CardRecipe } from "@ui/cards/recipe";
import { CircleCheckIcon, Plus } from "@ui/icons";
import { StepProgress } from "@ui/step-progress";
import { Text } from "@ui/text";
import { useReduceMotion } from "@ui/hooks/useReduceMotion";
import { theme } from "theme";

import { openInBrowser } from "~/lib/openInBrowser";
import { COVER_PLACEHOLDER } from "~/modules/recipes/constants";
import { useImportWebRecipe } from "~/modules/recipes/hooks";

/** The site a page came from, as the card's source line credits it. */
const _SITES: Record<WebRecipe["source"], string> = { marmiton: "marmiton.org" };

type WebRecipeCardProps = {
  /** Drawn through `CardRecipe`: the page's photo or the placeholder, its title, the source line. */
  recipe: WebRecipe;
  state: "idle" | "importing" | "done" | "failed";
  /** Importing only: how full the bar is. */
  progress?: number;
  /** Failed only: the failure's title, which never names a wait. */
  errorText?: string;
  /** Add, and Retry once it failed. */
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
 * The row under it holds one thing at a time: Add, the bar while it imports, "In your recipes" once
 * it is there. The bar is time, not progress: `StepProgress` always animates, so with reduced motion
 * the row says "Adding…" instead.
 */
export const WebRecipeCard = ({ recipe, state, progress, errorText, onAdd, onOpen }: WebRecipeCardProps) => {
  const t = useTranslations("Assistant");
  const reduceMotion = useReduceMotion();

  const subtitle = [
    t("webRecipe.servings", { count: recipe.servings }),
    t("webRecipe.ingredients", { count: recipe.ingredients.length }),
    _SITES[recipe.source],
  ].join(" · ");

  const row = (() => {
    switch (state) {
      case "importing":
        return reduceMotion
          ? <Text.Sm color={theme.colors.muted}>{t("webRecipe.adding")}</Text.Sm>
          : <StepProgress step={progress ?? 0} total={1} curve="linear" style={styles.bar} />;
      case "done":
        return (
          <View style={styles.done}>
            <CircleCheckIcon size={16} color={theme.colors.muted} />
            <Text.Sm color={theme.colors.muted}>{t("webRecipe.added")}</Text.Sm>
          </View>
        );
      case "failed":
      case "idle":
        return (
          <View style={styles.idle}>
            {errorText && <Text.Sm color={theme.colors.muted}>{errorText}</Text.Sm>}
            <Button variant="neutral" leftIcon={Plus} onPress={onAdd} style={styles.add}>
              {t("webRecipe.add")}
            </Button>
          </View>
        );
    }
  })();

  return (
    <View style={styles.container}>
      <CardRecipe
        style={styles.card}
        title={recipe.title}
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
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[8],
  },
  card: {
    alignSelf: "stretch",
    // The answer's width, not CardRecipe's 220px shelf cap.
    maxWidth: "100%",
  },
  bar: {
    marginHorizontal: theme.spacing[4],
  },
  done: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingLeft: theme.spacing[4],
  },
  idle: {
    alignItems: "flex-start",
    gap: theme.spacing[8],
  },
  add: {
    alignSelf: "flex-start",
  },
});
