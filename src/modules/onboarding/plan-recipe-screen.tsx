import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { CardMeal } from "@ui/cards/meal";
import { Message } from "@ui/message";
import { StepHeader } from "@ui/step-header";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useLocale } from "~/hooks/useLocale";
import { CUISKO } from "~/lib/mascots";

import { ChatAnswer, ChatQuestion, FakeChat, FOUND_EMOJI } from "./_components/fake-chat";
import { FakeNavigationBar } from "./_components/fake-navigation-bar";
import { IMPORTED_RECIPE, RECIPES } from "./_model/fixtures";
import { useFakeChat } from "./_hooks/useFakeChat";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useOnboardingPantry } from "./_hooks/useOnboardingPantry";
import { PLATES } from "./photos";

/** What the hint asks for: two people. */
const SERVINGS = 2;

/**
 * Screen 5: planning the imported gratin by asking Cuisko for it.
 *
 * One hint, prefilled: the gratin, for two, tomorrow night. Cuisko answers as the real chat does: the
 * search line, the plate it planned (the meal card the planning screen draws, with the day in its
 * slot label), and a line saying that what the cellar lacks went on the shopping list, which is all
 * of it, since the cellar from screen 2 holds only carrots and onions. The list is filled as the
 * answer lands, so the cooking on screen 6 finds it there. The bar sinks once the answer is in, and
 * Continue rises in its place.
 *
 * No Undo under the plate, unlike the real chat: here it could only do nothing or undo the step.
 */
export const OnboardingPlanRecipe = () => {
  const t = useTranslations("Onboarding");
  const tAssistant = useTranslations("Assistant");
  const tPlanning = useTranslations("Planning");
  const locale = useLocale();
  const { complete } = useOnboarding();
  const { plan } = useOnboardingPantry();
  const { sent, answered, pending, send, isDone } = useFakeChat(1, () => plan(RECIPES[IMPORTED_RECIPE].lines));

  const hint = t("PlanRecipe.hint");
  const recipe = RECIPES[IMPORTED_RECIPE];

  /** "samedi 25 · Dîner": tomorrow, as the real chat labels the plate it planned. */
  const slotLabel = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    return `${tomorrow.toLocaleDateString(locale, { weekday: "long", day: "numeric" })} · ${tPlanning("Meal.dinner")}`;
  }, [locale, tPlanning]);

  useEffect(() => {
    if (isDone) complete();
  }, [isDone, complete]);

  return (
    <View style={styles.flex}>
      <FakeChat
        header={<StepHeader title={t("PlanRecipe.title")} mascot={CUISKO.calendar} />}
        greeting={t("PlanRecipe.greeting")}
        isThinking={pending !== undefined}
      >
        {sent.length > 0 && <ChatQuestion content={hint} />}
        {answered.length > 0 && (
          <ChatAnswer status={{ emoji: FOUND_EMOJI, label: tAssistant("steps.searchRecipes.done", { count: 1 }) }}>
            <CardMeal
              style={styles.card}
              title={t(`RecipeNames.${IMPORTED_RECIPE}`)}
              duration={tPlanning("Meal.x_minutes", { count: recipe.minutes })}
              servings={SERVINGS}
              slot="dinner"
              slotLabel={slotLabel}
              imageSrc={PLATES[IMPORTED_RECIPE]}
            />
            <Message from="assistant" content={t("PlanRecipe.reply")} />
          </ChatAnswer>
        )}
      </FakeChat>
      <FakeNavigationBar hints={[hint]} used={sent} onSend={send} isAnswering={pending !== undefined} />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  /** As the real chat draws it: the answer's width, on the soft card ground. */
  card: { alignSelf: "stretch", backgroundColor: theme.colors.neutral.subtle },
});
