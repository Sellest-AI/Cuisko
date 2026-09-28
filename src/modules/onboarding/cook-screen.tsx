import { ComponentProps } from "react";

import { useTranslations } from "translations";

import { StepByStepView } from "~/modules/recipes/step-by-step-screen";

import { IMPORTED_RECIPE, INGREDIENT_CATEGORY, INGREDIENT_EMOJI, RECIPES } from "./_model/fixtures";
import { useOnboarding } from "./_hooks/useOnboarding";
import { useOnboardingPantry } from "./_hooks/useOnboardingPantry";
import { COVERS } from "./photos";

type ViewProps = ComponentProps<typeof StepByStepView>;

/** The gratin's method, cut to the two steps that are enough to show the mode. */
const STEPS = ["Cook.Steps.one", "Cook.Steps.two"] as const;

/**
 * Screen 6: cooking the gratin in the real cooking session.
 *
 * The session is the app's own `StepByStepView`, fed the gratin's cover, its lines and two steps,
 * so it looks exactly as it will at a real hob: the ingredients page, the numbered steps, and the
 * last page's "Update my cellar", held back for three seconds as it always is.
 *
 * It carries its own way on, so the chrome shows no Continue here: "Update my cellar" takes what
 * the recipe used out of the pretend cellar and moves straight on, the way the real button leaves
 * the session.
 */
export const OnboardingCook = () => {
  const t = useTranslations("Onboarding");
  const { complete, next } = useOnboarding();
  const { cook } = useOnboardingPantry();

  const lines = RECIPES[IMPORTED_RECIPE].lines;

  const steps: ViewProps["steps"] = STEPS.map((key, index) => ({
    instruction: t(key),
    hints: [],
    position: index + 1,
  }));

  const ingredients: ViewProps["ingredients"] = lines.map((line) => ({
    name: t(`Ingredients.${line.ingredient}`),
    quantity: line.quantity,
    unit: line.unit,
    emoji: INGREDIENT_EMOJI[line.ingredient],
    category: INGREDIENT_CATEGORY[line.ingredient],
    conversion: { defaultUnit: line.unit },
  }));

  return (
    <StepByStepView
      photo={COVERS[IMPORTED_RECIPE]}
      steps={steps}
      ingredients={ingredients}
      onFinish={() => {
        cook(lines);
        complete();
        next();
      }}
    />
  );
};
