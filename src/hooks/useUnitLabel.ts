import { useMemo } from "react";

import type { Unit } from "@shared/ingredients";
import { useTranslation, useTranslations } from "translations";

/**
 * The word a cook reads for a stored unit code — `tbsp` as "tbsp" in English and "cs" in French.
 *
 * The codes are English and the labels are not, which is the whole point of the split: storing
 * `cs` taught a model that a spoon was a cubic centimetre and cost a recipe five times its sugar,
 * so the vocabulary went English and the French words moved into `Vocabulary.Units` where every
 * other vocabulary keeps its words. C12 holds both locales complete.
 *
 * Here rather than in a module because four modules format a quantity — groceries, planning,
 * recipes and the step-by-step screen — and `shared/ingredients.ts` may not reach for
 * `translations` (ADR 0002 keeps that out of `src/ui/**`, and `shared/` runs in Convex besides).
 * So `formatQuantity` takes this as its `label` argument and stays ignorant of locale.
 *
 * ⚠️ Pass it. `formatQuantity` defaults to the stored code, which renders `2 tbsp` to a French
 *    cook and looks entirely correct on screen.
 */
export const useUnitLabel = () => {
  const t = useTranslations("Vocabulary");
  const { i18n } = useTranslation();

  /**
   * Keyed on the LANGUAGE, not on `t`. `useTranslations` builds a fresh closure every render, so a
   * dep on it would memoise nothing — and the quantity sheet's unit `Select` derives its whole row
   * list from this, which is the churn that memo was written to avoid.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (unit: Unit) => t(`Units.${unit}`), [i18n.language]);
};
