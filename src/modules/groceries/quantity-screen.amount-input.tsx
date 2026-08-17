import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Plus } from "@ui/icons";
import { Input } from "@ui/input";
import { Select } from "@ui/select";
import { theme } from "theme";

import { UNITS, unitLabel, type Unit } from "./_model/model";

/** Built once: the vocabulary is fixed, and rebuilding it per render churns the Select's rows. */
const UNIT_OPTIONS = UNITS.map((value) => ({ label: unitLabel(value), value }));

type Props = {
  unit: Unit;
  /**
   * Absent when the amount can only be expressed in the row's own unit.
   *
   * Taking stock out is the case: the cellar holds carrots in `pcs`, so "500 g" names a row it has
   * none of — the ladder would offer nothing and the typed amount would be clamped to zero. Adding
   * is the opposite, since a shopper may well come home with a unit the plan never mentioned.
   */
  onUnitChange?: (unit: Unit) => void;
  onSubmit: (amount: number) => void;
};

/**
 * An amount the ladder does not offer, typed.
 *
 * Holds its own text because half-typed input is nobody else's business — the sheet only ever
 * learns the number, and only once it is worth acting on.
 */
export const AmountInput = ({ unit, onUnitChange, onSubmit }: Props) => {
  const [text, setText] = useState("");

  /**
   * `parseFloat` is lax, so the guard has to be the strict half. `Number.isFinite` catches both the
   * empty field (`NaN`) and `"Infinity"`, which would otherwise be written into the cellar as an
   * amount no finite removal could ever clear. Zero and negatives are dropped here rather than
   * deeper, because every writer below silently no-ops on them and the sheet would close as if it
   * had committed something.
   *
   * The comma is normalised first: `parseFloat("1,5")` is `1`, silently, and a shopper typing on a
   * French keyboard would watch 1.5 kg go into the cellar as 1.
   *
   * A caveat this cannot fix from here: `type="number"` maps to `inputMode="numeric"` in
   * `src/ui/components/input.tsx`, a digits-only keypad, so on mobile no decimal can be typed at
   * all. That matters most for exactly this field — the `kg` and `l` ladders are fractional, so
   * the amounts worth typing are the ones off them. It needs a `decimal` mode in the design
   * system, which is not this module's to add.
   */
  const submit = useCallback(() => {
    const amount = parseFloat(text.replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) onSubmit(amount);
  }, [text, onSubmit]);

  return (
    <View style={styles.row}>
      <Input
        rightIcon={Plus}
        style={styles.field}
        placeholder="Type your own amount"
        type="number"
        onRightPress={submit}
        onSubmit={submit}
        onChangeText={setText}
        value={text}
      />
      {onUnitChange && (
        <Select value={unit} options={UNIT_OPTIONS} onChange={onUnitChange} style={styles.unit} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginBottom: theme.spacing[16],
    width: "100%",
  },
  field: {
    width: "100%",
  },
  /** Sits inside the field, clear of the submit button on its right. */
  unit: {
    position: "absolute",
    top: "50%",
    right: 56,
    transform: [{ translateY: "-50%" }],
  },
});
