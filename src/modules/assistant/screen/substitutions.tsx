import type { SubstitutionsCard } from "@shared/assistant";

import { CardSubstitutions } from "@ui/cards/substitutions";

import { useAssistantSubstitutions } from "../_hooks/useAssistantSubstitutions";

type Props = {
  card: SubstitutionsCard;
};

/**
 * The swaps one answer suggested. Renders nothing rather than an empty state, while loading too,
 * for the reason `RecipeCards` gives: it is an addition to an answer, never a section of the screen.
 */
export const Substitutions = ({ card }: Props) => {
  const { swaps } = useAssistantSubstitutions(card);

  if (swaps.length === 0) return null;

  return <CardSubstitutions swaps={swaps} />;
};
