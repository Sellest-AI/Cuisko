import { useState } from "react";
import { Share, StyleSheet, View } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { Household } from "@ui/cards/household";
import { HousePlus, Plus } from "@ui/icons";
import { Input } from "@ui/input";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

import { useHouseholds } from "./_hooks/useHouseholds";

/**
 * What each card scatters along its edge, by position in the list. Decoration, not data: nothing
 * about a household decides its fruit, so the list hands them out in turn.
 */
const DECORATIONS = [
  ["🐟", "🧅", "🍌", "🥬"],
  ["🍗", "🥒", "🥕", "🍅"],
  ["🥐", "🍋", "🧀", "🥑"],
];

/** The households the cook belongs to: join one by code, switch between them, leave, or start one. */
export const HouseholdList = ({ onSelect }: { onSelect?: (id: string) => void }) => {
  const t = useTranslations("Account");
  const { households, currentId, isJoining, joinError, select, leave, join, create } = useHouseholds();
  const [code, setCode] = useState("");

  /** The field keeps what was typed when the code is refused, so a one-letter typo is one fix. */
  const submitCode = async (value: string) => {
    if (!value.trim() || isJoining) return;
    if (await join(value)) setCode("");
  };

  /** A dismissed share sheet resolves; only a platform that cannot share at all rejects. */
  const shareCode = (householdCode: string) => {
    Share.share({ message: t("Households.share_code_x_code", { code: householdCode }) })
      .catch((cause) => { if (__DEV__) console.warn("[HouseholdList] share failed", cause); });
  };

  return (
    <View style={styles.container}>
      <Text.Lg>{t("Households.title")}</Text.Lg>
      {joinError && (
        <Text.Sm color={theme.colors.danger.base} style={styles.error}>
          {t(`Households.join_error_${joinError}`)}
        </Text.Sm>
      )}
      <ButtonPill variant="neutral" size="md" leftIcon={HousePlus} onPress={create}>
        {t("Households.create")}
      </ButtonPill>
      {households.map((household, index) => {
        const isCurrent = household.id === currentId;

        return (
          <Household
            key={household.id}
            name={household.name}
            code={household.code}
            memberSeeds={household.memberSeeds}
            decorations={DECORATIONS[index % DECORATIONS.length]}
            isCurrent={isCurrent}
            onPress={isCurrent ? undefined : () => { select(household.id); onSelect?.(household.id) }}
            onCodePress={() => shareCode(household.code)}
            // The kitchen the cook is standing in is switched away from before it is left.
            onLeave={isCurrent ? undefined : () => leave(household.id)}
          />
        );
      })}
      <Input
        placeholder={t("Households.join_placeholder")}
        value={code}
        onChangeText={setCode}
        onSubmit={submitCode}
        rightIcon={Plus}
        onRightPress={() => submitCode(code)}
        isLoading={isJoining}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: theme.spacing[12] },
  error: { paddingHorizontal: theme.spacing[16] },
});
