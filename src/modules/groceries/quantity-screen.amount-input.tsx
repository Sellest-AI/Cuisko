import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Plus } from "@ui/icons";
import { Input } from "@ui/input";
import { Select } from "@ui/select";
import { theme } from "theme";
import { useTranslations } from "translations";

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
  const t = useTranslations("Groceries");
  const [text, setText] = useState("");

  /**
   * `parseFloat` is lax, so the guard has to be the strict half. `Number.isFinite` catches both the
   * empty field (`NaN`) and `"Infinity"`, which would otherwise be written into the cellar as an
   * amount no finite removal could ever clear. Zero and negatives are dropped here rather than
   * deeper, because every writer below silently no-ops on them and the sheet would close as if it
   * had committed something.
   *
   * The comma is normalised first. `parseFloat("1,5")` is `1`, silently, and the keypad this field
   * asks for offers whichever separator the locale uses — so a shopper typing on a French keyboard
   * would otherwise watch 1.5 kg go into the cellar as 1.
   */
  const submit = useCallback(() => {
    const amount = parseFloat(text.replace(",", "."));

    if (Number.isFinite(amount) && amount > 0) onSubmit(amount);
  }, [text, onSubmit]);

  return (
    <View style={styles.row}>
      {/* `decimal`, not `numeric`: the kg and l ladders are fractional, so the amounts worth
          typing here are exactly the ones a digits-only keypad cannot express. */}
      <Input
        rightIcon={Plus}
        style={styles.field}
        placeholder={t("Quantity.custom_amount")}
        type="decimal"
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
