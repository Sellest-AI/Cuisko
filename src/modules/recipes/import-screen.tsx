import { router } from "expo-router";
import { useState } from "react";
import { Keyboard, LayoutChangeEvent, Platform, Pressable, StyleSheet, View, ViewStyle } from "react-native";

import { ButtonPill } from "@ui/button-pill";
import { CircleAlert, Globe, Pencil } from "@ui/icons";
import { InfoBanner } from "@ui/info-banner";
import { Input } from "@ui/input";
import { Text } from "@ui/text";
import { theme } from "~/global/theme";
import { useTranslations } from "translations";

import { useImportRecipe } from "./_hooks/useImportRecipe";
import { importFailureOf } from "./_model/importFailure";

type Props = {
  style?: ViewStyle;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * Where a recipe comes into Cuisko: pasted as a link, or typed out.
 *
 * The two are one screen because they are one decision, and the second is the answer when the first
 * does not work. Every failure below therefore still leaves "write a recipe" on screen: the import
 * is a shortcut past typing, and when the shortcut is closed the road it shortcuts is still open.
 *
 * It fetches nothing itself — `_hooks/useImportRecipe` owns the action, the draft it hands to the
 * editor, and the navigation on success.
 */
export const ImportScreen = ({ style, onLayout }: Props) => {
  const t = useTranslations("Recipe");

  const [url, setUrl] = useState<string>("");
  const { importFrom, isImporting, error } = useImportRecipe();

  const failure = importFailureOf(error);

  return (
    <View
      style={[styles.container, style]}
      onLayout={onLayout}
    >
      {/*
        * The sheet's background, and the only thing on it that gives the keyboard back.
        *
        * A form sheet has nothing outside itself to tap: the field keeps focus until something
        * asks it to let go, so without this the keyboard sits over the screen until the cook
        * submits or dismisses the whole modal. Rendered first, so it is under everything and only
        * ever catches a tap that missed the field and the two buttons.
        *
        * Absolutely positioned rather than wrapping the column — `onLayout` above measures this
        * screen to cut the sheet to it, and a tap-catcher in the flow would be measured too.
        */}
      <Pressable
        accessible={false}
        style={StyleSheet.absoluteFill}
        onPress={() => Keyboard.dismiss()}
      />
      <Text.Lg style={styles.title}>{t("Import.url_title")}</Text.Lg>
      <Input
        isLoading={isImporting}
        rightIcon={Globe}
        onRightPress={() => importFrom(url)}
        onSubmit={() => importFrom(url)}
        onChangeText={setUrl}
        placeholder={t("Import.url_placeholder")}
        value={url}
        style={styles.input}
      />
      {failure && (
        <InfoBanner
          variant="warning"
          icon={CircleAlert}
          title={t(failure.title)}
          style={styles.error}
        >
          {t(failure.body)}
        </InfoBanner>
      )}
      <Text.Lg style={styles.title}>{t("Import.write_title")}</Text.Lg>
      <ButtonPill
        rightIcon={Pencil}
        onPress={() => router.replace("/recipe/new")}
        elevated
        variant="secondary"
        size="lg"
        style={styles.write}
      >
        {t("Import.write")}
      </ButtonPill>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: theme.spacing[32],
    paddingBottom: Platform.select({
      ios: theme.spacing[16],
      default: theme.spacing[16],
    }),
  },
  title: {
    marginTop: theme.spacing[28],
    marginBottom: theme.spacing[16],
  },
  input: {
    padding: theme.spacing[8],
    paddingRight: theme.spacing[8],
  },
  /** Under the field it is about, so the reason sits where the cook is already looking. */
  error: { marginTop: theme.spacing[16] },
  write: { minHeight: 64, justifyContent: "space-between" },
});
