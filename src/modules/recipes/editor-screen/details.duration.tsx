import { useState } from "react";
import { View, StyleSheet } from "react-native";

import { Input } from "@ui/input";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { durationTextOf, minutesOf } from "../_model/editor";

type Props = {
  label: string;
  emoji: string;
  /** Stored minutes, or `undefined` for a timing the recipe does not state. */
  minutes: number | undefined;
  onChange: (minutes: number | undefined) => void;
};

/**
 * One timing, typed the way a cook says it: `1h30`, `45 min`, `20`.
 *
 * **Reported per keystroke, rewritten on blur.** Every keystroke that parses reaches the form, so
 * Save sends what is typed even while the field still has focus — on a phone, tapping Save outside
 * the scroll view does not blur it first. The TEXT is only rewritten to the canonical form on blur:
 * half of `1h30` is `1h`, and normalising mid-keystroke would fight the cook's thumb. The canonical
 * form parses back to the same number, so leaving the field twice changes nothing.
 *
 * **Unparseable is ignored, empty clears.** A typo or a stray paste reports nothing, so the form
 * keeps the last value that parsed and blur puts it back in the box; emptying the field is how a
 * timing is removed.
 *
 * A text keyboard rather than the numeric keypad, because `1h30` has a letter in it — accepted for a
 * field touched once per recipe. If it grates in use, the fallback is two numeric fields per row
 * (`h` and `min`): more taps, the right keypad.
 */
export const DurationField = ({ label, emoji, minutes, onChange }: Props) => {
  const t = useTranslations("Recipe");
  const minuteWord = t("Editor.minute_unit");

  const [text, setText] = useState(() => durationTextOf(minutes, minuteWord));

  /**
   * Follow `minutes` when it moves on its own — the editor seeds its fields once the recipe lands,
   * which can be a render after this row mounted. Adjusted during render rather than in an effect,
   * so the row never paints one frame of the stale text first. A value this row reported itself is
   * recorded first in `onChangeText`, so its echo back through `minutes` never rewrites the text
   * under the cook's thumb.
   */
  const [shownFor, setShownFor] = useState(minutes);
  if (shownFor !== minutes) {
    setShownFor(minutes);
    setText(durationTextOf(minutes, minuteWord));
  }

  const report = (next: number | undefined) => {
    if (next === minutes) return;
    setShownFor(next);
    onChange(next);
  };

  const onChangeText = (typed: string) => {
    setText(typed);
    if (typed.trim() === "") report(undefined);
    else {
      const parsed = minutesOf(typed);
      if (parsed !== undefined) report(parsed);
    }
  };

  const onBlur = () => setText(durationTextOf(minutes, minuteWord));

  return (
    <View style={styles.row}>
      <Text.Base style={styles.label} color={colors.neutral.base}>
        {emoji} {label}
      </Text.Base>
      <Input
        value={text}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={t("Editor.duration_placeholder")}
        style={styles.input}
        highlightOnFocus
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
  },
  label: { flex: 1 },
  input: { flex: 1, borderRadius: theme.radius.sm },
});
