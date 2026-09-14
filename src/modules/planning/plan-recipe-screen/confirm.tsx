import { StyleSheet, View } from "react-native";

import { Button } from "@ui/button";
import { ArrowRightIcon } from "@ui/icons";
import { Image, type ImageProps } from "@ui/image";
import { Text } from "@ui/text";
import { theme } from "theme";
import { useTranslations } from "translations";

const PLATE_SIZE = 96;

/** A dish as the swap draws it: its plate. The name goes into the sentence, not under the picture. */
export type Dish = { imageSrc: ImageProps["source"] };

type Props = {
  previous: Dish;
  next: Dish;
  body: string;
  isSaving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The plate already on that slot, beside the one about to take its place.
 *
 * Asked rather than done: the tile said what it held, but a thumb lands on a tile faster than an
 * eye reads its caption, and a dinner silently gone from the week is the kind of surprise that
 * teaches a household not to trust the plan.
 */
export const Confirm = ({ previous, next, body, isSaving, onConfirm, onCancel }: Props) => {
  const t = useTranslations("Planning");

  return (
    <>
      <View style={styles.swap}>
        <Image source={previous.imageSrc} style={styles.plate} contentFit="contain" />
        <ArrowRightIcon size={28} color={theme.colors.primary.base} />
        <Image source={next.imageSrc} style={styles.plate} contentFit="contain" />
      </View>
      <Text.H4 style={styles.title}>{t("PlanRecipe.replace_title")}</Text.H4>
      <Text.Base color={theme.colors.muted} style={styles.body}>{body}</Text.Base>
      {/*
        * Stacked, and stretched rather than flexed: `Pressable` copies `flex` onto its inner
        * view too, where it resolves against a parent with no height and collapses the button.
        */}
      <View style={styles.actions}>
        <Button onPress={onConfirm} variant="primary" elevated isLoading={isSaving} style={styles.action}>{t("PlanRecipe.confirm")}</Button>
        <Button variant="neutral" onPress={onCancel} style={styles.action}>{t("PlanRecipe.cancel")}</Button>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  swap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[24],
    marginVertical: theme.spacing[16],
  },
  plate: { width: PLATE_SIZE, height: PLATE_SIZE },
  title: {
    textAlign: "center",
    marginTop: theme.spacing[12]
  },
  body: {
    textAlign: "center",
    marginTop: theme.spacing[20],
    marginBottom: theme.spacing[20],
    lineHeight: theme.font.base.lineHeight * 1.1,
    fontWeight: 400
  },
  actions: { gap: theme.spacing[12] },
  action: { alignSelf: "stretch", minHeight: 48 },
});
