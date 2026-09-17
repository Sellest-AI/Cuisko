import { StyleSheet, View } from "react-native";

import { CircleCheckIcon, CircleDashedIcon } from "@ui/icons";
import { Image } from "@ui/image";
import { Pressable } from "@ui/pressable";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

import { formatQuantity } from "@shared/ingredients";

import { useUnitLabel } from "~/hooks/useUnitLabel";

import { MEAL_IMAGE } from "../_hooks/placeholders";
import { type DraftMeal, type GroceryRow } from "../_model/model";
import { useTranslations } from "translations";

type Props = {
  row: GroceryRow;
  /** The meals needing this row, already resolved — drawn as the stack of little plates. */
  meals: DraftMeal[];
  owned: boolean;
  onToggle?: () => void;
};

const AVATAR = 22;
const AVATAR_OVERLAP = -8;
const PRODUCE = {
  width: 56,
  height: 64,
};

/**
 * One ingredient the week needs: how much, and which meals are asking for it.
 *
 * The stack of plates is the row's justification — it answers "why is this on my list?" without a
 * tap, which is the difference between a list you trust and one you second-guess in the shop.
 */
export const TunnelGroceryRow = ({ row, meals, owned, onToggle }: Props) => {
  const t = useTranslations("Planning");
  const unit = useUnitLabel();

  return (
    <View style={styles.row}>
      <View style={styles.produce}>
        {row.imageUrl ? <Image
          source={row.imageUrl}
          contentFit="contain"
          style={[styles.ingredientImage]}
        /> : <Text.H4 style={styles.emoji}>{row.emoji}</Text.H4>}
      </View>
      <View style={[styles.body, owned ? { opacity: 0.5 } : {}]}>
        <View style={[styles.titleRow, owned && { justifyContent: "flex-start" }]}>
          <Text.Base
            color={colors.muted}
            numberOfLines={1}
            style={styles.name}
          >
            {row.name}
          </Text.Base>
          <View style={[
            styles.quantity,
            !owned && styles.quantityBig,
            owned ? { opacity: 0.5 } : {}
          ]}>
            <Text.Base>
              {formatQuantity(Math.ceil(row.amount), row.unit, unit)}
            </Text.Base>
          </View>
        </View>
        <View style={styles.avatars}>
          {meals.map((meal, index) => (
            <Image
              key={meal.id}
              source={meal.imageUrl ? { uri: meal.imageUrl } : MEAL_IMAGE}
              contentFit="cover"
              style={[styles.avatar, index > 0 && { marginLeft: AVATAR_OVERLAP }]}
            />
          ))}
        </View>
      </View>
      {(onToggle || owned) && <Pressable
        intensity={0.94}
        onPress={onToggle}
        disabled={!onToggle}
        style={{ ...styles.toggle, ...(owned ? styles.toggleOwned : styles.toggleNeeded) }}
      >
        {owned
          ? <CircleCheckIcon size={16} color={colors.secondary.base} />
          : <CircleDashedIcon size={16} color={colors.muted} />}
        <Text.Base color={owned ? colors.secondary.base : colors.muted} weight={600}>
          {owned ? t("Tunnel.Groceries.have") : t("Tunnel.Groceries.need")}
        </Text.Base>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
  },
  produce: {
    width: PRODUCE.width,
    height: PRODUCE.height,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.elevated,
    borderWidth: 1,
    borderColor: colors.border.dark,
  },
  body: { flex: 1 },
  /** Overrides the H4 metrics — an emoji needs the room a heading does not. */
  emoji: {
    fontSize: 32,
    lineHeight: 40
  },
  ingredientImage: {
    height: 44,
    width: 40,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[8],
  },
  name: { flexShrink: 1 },
  quantity: {
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.elevated,
  },
  quantityBig: {
    borderColor: colors.border.dark,
    borderWidth: 1,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[4],
  },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: colors.background,
    marginTop: theme.spacing[6]
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[6],
    padding: theme.spacing[16],
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    marginLeft: theme.spacing[8],
  },
  /** Already in the kitchen: closed and tinted, the way the cellar reads elsewhere. */
  toggleOwned: {
    borderStyle: "solid",
    borderColor: colors.secondary.elevated,
    backgroundColor: colors.secondary.subtle,
  },
  /** Still missing: an open, dashed outline — nothing has happened to it yet. */
  toggleNeeded: {
    borderStyle: "dashed",
    borderColor: colors.neutral.elevated,
    backgroundColor: colors.surface.elevatedSubtle,
  },
});
