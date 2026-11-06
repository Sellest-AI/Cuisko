import { router } from "expo-router";
import { Easing } from "react-native-reanimated";
import { StyleSheet, View } from "react-native";
import { useTranslations } from "translations";

import { useReduceMotion } from "@ui/hooks/useReduceMotion";
import { CalendarPlus } from "@ui/icons";
import { Button } from "@ui/button";
import { Image } from "@ui/image";
import { m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

import { CUISKO_HEAD } from "~/lib/mascots";
import { useRecipe } from "~/modules/recipes/hooks";

/** Big enough to be the subject of the screen, small enough to leave the words above the fold. */
const HEAD_SIZE = 172;

/** The recipe's plate, held up at Cuisko's side: half the head, so the face stays the subject. */
const PLATE_SIZE = 86;

/** How far left of its place the plate starts. */
const PLATE_TRAVEL = 60;

/** The turn that distance takes on a plate's rim, so it reads as rolling and not as sliding. */
const PLATE_TURN = (PLATE_TRAVEL / (PLATE_SIZE / 2)) * (180 / Math.PI);

const PLATE_TO_THE_LEFT = { opacity: 0, translateX: -PLATE_TRAVEL, rotate: `${-PLATE_TURN}deg` };
const PLATE_IN_PLACE = { opacity: 1, translateX: 0, rotate: "0deg" };

/** With reduced motion the plate only appears: the fade says it arrived, without the travel. */
const PLATE_FADED = { opacity: 0 };
const PLATE_SHOWN = { opacity: 1 };

/** The strong ease-out: most of the distance lands early, and the long tail is the plate settling. */
const PLATE_ENTRANCE = { type: "timing", duration: 900, delay: 100, easing: Easing.bezier(0.23, 1, 0.32, 1) } as const;

type Props = {
  /** Opened from a recipe: the greeting is about that dish, and nothing here sends the cook off it. */
  recipeId?: string;
};

/**
 * What the assistant says before anyone has asked it anything.
 *
 * Reachable since Quick Access started linking straight here: the navigation bar used to be the
 * only door in, and it always arrived carrying a question. It is a greeting and not an error, so
 * Cuisko is in it — PRODUCT.md only puts the mascot aside when something has gone wrong.
 *
 * **The button is not the way to ask a question**, and deliberately so: the bar to type in is
 * already on screen, and a button pointing at it would be the screen explaining its own furniture.
 * It offers the other thing worth doing instead, so a shopper who opened this with nothing in mind
 * has somewhere to go rather than a blinking cursor.
 *
 * `replace` rather than `push` — the tunnel is a destination, not a step deeper into a
 * conversation that was never started, and Back from it should reach what was behind this modal.
 */
export const AssistantEmpty = ({ recipeId }: Props) => {
  const { recipe } = useRecipe(recipeId);
  const t = useTranslations("Assistant");
  const reduceMotion = useReduceMotion();
  const plate = recipe?.plateImageLargeUrl;

  return (
    <View style={styles.container}>
      <View>
        <Image
          source={CUISKO_HEAD}
          style={[styles.head, plate !== undefined && styles.headBesidePlate]}
          contentFit="contain"
        />
        {plate !== undefined && (
          <m.View
            from={reduceMotion ? PLATE_FADED : PLATE_TO_THE_LEFT}
            animate={reduceMotion ? PLATE_SHOWN : PLATE_IN_PLACE}
            transition={PLATE_ENTRANCE}
            style={styles.plate}
          >
            <Image source={plate} style={styles.plateImage} contentFit="contain" />
          </m.View>
        )}
      </View>
      <Text.H4 style={styles.title}>{t(recipeId ? "empty_recipe_title" : "empty_title")}</Text.H4>
      <Text.Base color={colors.muted} style={styles.body}>
        {t(recipeId ? "empty_recipe_body" : "empty_body")}
      </Text.Base>
      {!recipeId && (
        <Button
          variant="primary"
          onPress={() => router.replace("/planning/new")}
          style={styles.action}
          leftIcon={CalendarPlus}
        >
          {t("empty_action")}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.spacing[16],
    paddingTop: 56,
    paddingHorizontal: theme.spacing[24],
    maxWidth: 340,
    marginHorizontal: "auto",
  },
  head: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    marginBottom: theme.spacing[12],
  },
  headBesidePlate: { marginLeft: theme.spacing[16] },
  plate: {
    position: "absolute",
    bottom: theme.spacing[12],
    left: -10,
    width: PLATE_SIZE,
    height: PLATE_SIZE,
  },
  plateImage: { width: "100%", height: "100%" },
  title: { textAlign: "center" },
  body: { textAlign: "center", opacity: 0.8 },
  action: { marginTop: theme.spacing[6] },
});
