import { Fragment, useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { CardRecipe } from "@ui/cards/recipe";
import { ForkKnifeIcon } from "@ui/icons";
import { Message } from "@ui/message";
import { StepHeader } from "@ui/step-header";
import { theme } from "theme";
import { useTranslations } from "translations";

import { ChatAnswer, ChatQuestion, FakeChat, FOUND_EMOJI } from "./_components/fake-chat";
import { FakeNavigationBar } from "./_components/fake-navigation-bar";
import { RECIPE_SEARCHES, RECIPES } from "./_model/fixtures";
import { useFakeChat } from "./_hooks/useFakeChat";
import { useOnboarding } from "./_hooks/useOnboarding";
import { COVERS } from "./photos";

const GUTTER = theme.spacing[16];
/** Narrow enough that a second card shows at the edge, as the real chat's shelf does. */
const SHELF_CARD_WIDTH = 200;

/**
 * Screen 3: asking Cuisko for recipes, two ways.
 *
 * A chat rather than a search, because the point is that Cuisko can be talked to: an ingredient and
 * a mood, one hint each, sent from the bar as the user's own message, and each answered with a
 * line and a shelf of recipes, as the real assistant answers. Two rather than more, so the screen
 * goes quickly. Continue opens once both have been answered.
 */
export const OnboardingRecipes = () => {
  const t = useTranslations("Onboarding");
  const tAssistant = useTranslations("Assistant");
  const { complete } = useOnboarding();
  const { sent, answered, pending, send, isDone } = useFakeChat(RECIPE_SEARCHES.length);

  const hints = RECIPE_SEARCHES.map(({ id }) => t(`Recipes.Hints.${id}`));

  useEffect(() => {
    if (isDone) complete();
  }, [isDone, complete]);

  return (
    <View style={styles.flex}>
      <FakeChat
        header={<StepHeader title={t("Recipes.title")} icon={ForkKnifeIcon} />}
        greeting={t("Recipes.greeting")}
        isThinking={pending !== undefined}
      >
        {sent.map((index) => {
          const search = RECIPE_SEARCHES[index]!;

          return (
            <Fragment key={search.id}>
              <ChatQuestion content={hints[index]!} />
              {answered.includes(index) && (
                <ChatAnswer
                  status={{
                    emoji: FOUND_EMOJI,
                    label: tAssistant("steps.searchRecipes.done", { count: search.results.length }),
                  }}
                >
                  <Message from="assistant" content={t(`Recipes.Replies.${search.id}`)} />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.shelf}
                    contentContainerStyle={styles.shelfCards}
                  >
                    {search.results.map((id) => (
                      <CardRecipe
                        key={id}
                        title={t(`RecipeNames.${id}`)}
                        subtitle={t("minutes", { minutes: RECIPES[id].minutes })}
                        imageSrc={COVERS[id]}
                        style={styles.card}
                      />
                    ))}
                  </ScrollView>
                </ChatAnswer>
              )}
            </Fragment>
          );
        })}
      </FakeChat>
      <FakeNavigationBar hints={hints} used={sent} onSend={send} isAnswering={pending !== undefined} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  /** Runs to the screen edges, so a card scrolled off reads as more to come, not as clipped. */
  shelf: { marginHorizontal: -GUTTER },
  shelfCards: { gap: theme.spacing[12], paddingHorizontal: GUTTER, paddingVertical: theme.spacing[8] },
  card: { width: SHELF_CARD_WIDTH },
});
