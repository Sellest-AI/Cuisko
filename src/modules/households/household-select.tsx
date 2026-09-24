import type { ViewStyle } from "react-native";

import { Select } from "@ui/select";

import { useHouseholds } from "./_hooks/useHouseholds";

type Props = { style?: ViewStyle };

/**
 * Which household the app is shopping for, and the switch between them.
 *
 * One component rather than the same adapter in every header that shows it: the home header and
 * the grocery list both do, and two copies of "households to options, current to value" drift the
 * first time one of them learns something the other does not.
 *
 * Draws nothing until there is a current household to show, which is only ever while `getMine` is
 * in flight or for an account made before sign-up created households.
 */
export const HouseholdSelect = ({ style }: Props) => {
  const { households, currentId, select } = useHouseholds();

  if (!currentId) return null;

  return (
    <Select
      value={currentId}
      onChange={select}
      options={households.map((household) => ({ label: household.name, value: household.id }))}
      style={style}
    />
  );
};
