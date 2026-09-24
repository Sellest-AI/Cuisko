import type { DisplayCard } from "@shared/assistant";

import { displayLayout } from "../_model/displayLayout";
import { RecipeCards } from "./recipe-cards";

type Props = {
  card: DisplayCard;
};

/**
 * One card Cuisko chose to show, drawn by the component for its kind.
 *
 * The switch is exhaustive by type: a new kind in `DISPLAY_KINDS` leaves `card` un-narrowed below
 * and fails to compile here until it is drawn.
 */
export const Display = ({ card }: Props) => {
  switch (card.kind) {
    case "recipes":
      return <RecipeCards recipeIds={card.ids} layout={displayLayout(card)} />;
    default:
      return card.kind satisfies never;
  }
};
