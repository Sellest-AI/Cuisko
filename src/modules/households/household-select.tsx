import type { ViewStyle } from "react-native";

import { Button } from "@ui/button";
import { WifiOff } from "@ui/icons";
import { Select } from "@ui/select";
import { useIsOffline } from "~/modules/network/hooks";
import { useTranslations } from "translations";

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
 *
 * Offline, a chip in its place: the list on screen is the last one seen, and a switch could not
 * reach the server. Checked before the household, which offline has not loaded (`useHouseholds`
 * waits for Convex to confirm the session), so the chip would otherwise never draw.
 */
export const HouseholdSelect = ({ style }: Props) => {
  const t = useTranslations("Network");
  const isOffline = useIsOffline();
  const { households, currentId, select } = useHouseholds();

  if (isOffline)
    return (
      <Button
        leftIcon={WifiOff}
        style={style}
        onPress={() => null}
        variant="neutral"
        disabled
      >
        {t("offline_chip")}
      </Button>
    );

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
