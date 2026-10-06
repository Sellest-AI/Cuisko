/**
 * The recipe a question is asked from, read off the assistant's route.
 *
 * The cooking screen opens `/assistant` with the recipe beside the question (`q`): its id, the step
 * on screen and the servings on the stepper. They stay in the URL for as long as the modal is open,
 * so every question asked there — the first one and every follow-up typed in the bar — goes out
 * with the same recipe, and closing the assistant is what forgets it.
 *
 * Route params arrive as text, and as an array when a key repeats; this turns them back into the
 * shape `sendMessage` takes. A number that does not parse is dropped, not sent: the server would
 * drop it anyway, and the recipe is still worth sending without it.
 */

type Param = string | string[] | undefined;

export type CookingParams = { recipeId?: Param; step?: Param; servings?: Param };

/** The id stays a string here: `_model/` takes no Convex import, so the hook names its table. */
export type CookingContext = { id: string; step?: number; servings?: number };

const _first = (param: Param) => (Array.isArray(param) ? param[0] : param);

const _number = (param: Param) => {
  const value = _first(param);
  if (value === undefined || value.trim() === "") return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const cookingContextOf = (params: CookingParams): CookingContext | undefined => {
  const id = _first(params.recipeId)?.trim();
  if (!id) return undefined;

  const step = _number(params.step);
  const servings = _number(params.servings);

  return {
    id,
    ...(step !== undefined && { step }),
    ...(servings !== undefined && { servings }),
  };
};
