import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GroupSelect } from "@ui/group-select";
import { theme } from "theme";
import { useTranslations } from "translations";

/**
 * The tastes the plan is generated against.
 *
 * Ids, not labels: the screen names them through `t()`, so the answer that will eventually be
 * saved does not change when the interface language does.
 */
const DIET_PREFERENCES = [
  { value: "high-protein", key: "Preferences.high_protein", icon: "💪" },
  { value: "high-calorie", key: "Preferences.high_calorie", icon: "🔥" },
  { value: "low-carb", key: "Preferences.low_carb", icon: "🥦" },
] as const;

type Props = {
  onClose: () => void;
};

export const PreferencesScreen = ({ onClose }: Props) => {
  const t = useTranslations("Planning");

  /**
   * Held here rather than in a hook because nothing persists it yet. When the plan starts reading
   * these, the state moves to `_hooks/` and this screen keeps its shape (ADR 0006).
   */
  const [selected, setSelected] = useState<string[]>(["high-protein"]);

  const toggle = useCallback(
    (value: string) =>
      setSelected((current) =>
        current.includes(value) ? current.filter((id) => id !== value) : [...current, value],
      ),
    [],
  );

  return (
    <>
      <LinearGradient
        colors={[theme.colors.neutral.subtle, theme.colors.neutral.foreground]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
      />
      <View
        style={styles.page}
      >
        <GroupSelect
          label={t("Preferences.question")}
          onSelect={toggle}
          items={DIET_PREFERENCES.map((preference) => ({
            value: preference.value,
            label: t(preference.key),
            icon: preference.icon,
            selected: selected.includes(preference.value),
          }))}
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: 56,
  }
})
