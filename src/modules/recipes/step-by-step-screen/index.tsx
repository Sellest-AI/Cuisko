import { useCookRecipe } from "../_hooks/useCookRecipe";
import { useRecipe } from "../_hooks/useRecipe";
import { flattenSteps } from "../_model/detail";
import { COVER_PLACEHOLDER } from "../constants";
import { StepByStepView } from "./view";

export { StepByStepView } from "./view";

type Props = {
  /** The recipe to cook. The route's, like `onClose` — a screen cannot know what opened it. */
  id?: string;
  /** The route's, because a screen cannot know what it was opened from. */
  onClose: () => void;
  /** Where the dish goes once the server has taken the cook: the route's too, for the same reason. */
  onCooked: () => void;
};

/**
 * The cooking session for one recipe: fetches it, and hands `StepByStepView` what to draw.
 *
 * Deliberately not one of the recipe's tabs: it opens over them, carries its own photo per step,
 * and replaces the chrome's navigation with a transport. Nothing about it survives a tab switch,
 * which is the point — this is a session, not a view.
 */
export const StepByStepScreen = ({ id, onClose, onCooked }: Props) => {
  const { recipe, ingredients, servings, setServings } = useRecipe(id);
  const { cook, isCooking, failed } = useCookRecipe();

  return (
    <StepByStepView
      /**
       * The photo behind every step is the recipe's cover, until a step has media of its own.
       *
       * Nothing records one yet: `recipeSteps` does not exist, and reading a picture or a clip out
       * of the instruction's words is a paid lookup this slice does not make. So the header falls
       * back the way the recipe's own chrome does — the cover, or the placeholder while there is no
       * cover either — and `StepMedia` keeps its transport for the day a step brings a video.
       */
      photo={recipe?.coverImageLargeUrl ?? COVER_PLACEHOLDER}
      /**
       * The method as one unbroken run, because a cook at a hob is walking steps rather than
       * reading groups — and `flattenSteps` is what keeps "step 3" meaning the same thing here as
       * on the tab.
       */
      steps={flattenSteps(recipe?.instructions ?? [])}
      ingredients={ingredients}
      servings={{ value: servings, onChange: setServings }}
      onClose={onClose}
      /**
       * The screen leaves only once the server has agreed: a modal dismissed over a write that
       * then fails would leave the cook believing their cellar moved when it did not.
       */
      onFinish={async () => { if (recipe && (await cook(recipe.id, servings))) onCooked(); }}
      isFinishing={isCooking}
      finishFailed={failed}
    />
  );
};
