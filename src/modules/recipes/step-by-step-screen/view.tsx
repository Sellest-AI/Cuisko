import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";


import { MIN_SERVINGS } from "@shared/servings";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { Minus, Plus, X } from "@ui/icons";
import { AnimatePresence, m } from "@ui/motion";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { RecipeScreen } from "../_components/recipe-screen";
import type { FlatStep, RecipeLine } from "../_model/detail";
import { ingredientsIn } from "../_model/quantities";
import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING, SERVINGS_RESET_DELAY } from "../constants";
import { StepBar } from "./bar";
import { PrepCard, StepCard } from "./card";
import { StepMedia } from "./media";

/** How much of the screen the photo takes at rest, leaving the card the rest of it. */
const MEDIA_RATIO = 0.4;

type Props = {
  /**
   * Behind every step: the recipe's cover, or a placeholder while it has none. A URL or a bundled
   * asset, the two the parallax header can draw.
   */
  photo: string | number;
  /** The method as one run, `flattenSteps`'s output, so "step 3" means what it does on the tab. */
  steps: FlatStep[];
  /** Every line, already scaled to the portions, which the step cards read their amounts from. */
  ingredients: RecipeLine[];
  /** The portions pill on the first page. Left out, there is no pill and the lines stay as given. */
  servings?: { value: number; onChange: (servings: number) => void };
  /** The way out. Left out, the page has none: a caller that is itself one step of a flow. */
  onClose?: () => void;
  /** The last page's button: what the cooking consumed leaves the cellar. */
  onFinish: () => void;
  /** The finish is in flight: the button waits, so a second tap cannot spend the cellar twice. */
  isFinishing?: boolean;
  /** The finish was refused, and the cook is still here to be told so. */
  finishFailed?: boolean;
};

/**
 * The recipe, one step at a time, for someone standing at a hob rather than reading a page: the
 * drawing only, fed by whoever mounts it.
 *
 * Apart from `StepByStepScreen` so a screen with no recipe to fetch still draws the session as it
 * really looks: the onboarding walks a new cook through a gratin on this very view, and a copy of
 * it there would be a second design to keep in step with this one.
 *
 * It sits in the same parallax container the tabs do, so the photo behaves the way it does
 * everywhere else in the recipe: it drifts and scales under the content instead of scrolling off,
 * and a step whose ingredients run past the fold reads as one page rather than two panes.
 */
export const StepByStepView = ({
  photo,
  steps,
  ingredients,
  servings,
  onClose,
  onFinish,
  isFinishing = false,
  finishFailed = false,
}: Props) => {
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);

  /** The bar overlays the page; until it has been laid out, assume the height every other bar has. */
  const [barHeight, setBarHeight] = useState(NAVIGATION_BAR_OFFSET);

  /**
   * Page 0 is mise en place, not a method step — the session's own invitation to get everything
   * out before the first instruction. Every page after it is `steps[index - 1]`, so the two ends
   * of the transport (`isFirst`, `isLast`) can clamp against one range instead of two.
   */
  const lastIndex = steps.length;
  const step = index === 0 ? undefined : steps[index - 1];
  const isFirst = index === 0;
  const isLast = index === lastIndex;

  /**
   * Nothing to cook: still loading, refused, or a recipe whose method was never written down. The
   * exit has to stay reachable in all three, so this draws the screen with no step in it rather
   * than returning null and stranding a cook on a blank modal.
   */
  if (steps.length === 0) {
    return (
      <View style={styles.screen}>
        <SafeAreaView edges={{ bottom: "off" }} style={styles.exit} pointerEvents="box-none">
          {onClose && (
            <ButtonIcon elevated variant="neutral-inverted" size="md" onPress={onClose}>
              {X}
            </ButtonIcon>
          )}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ParallaxScrollView
        /**
         * Each step opens at its own top. The scroll container outlives all of them, so without
         * this, moving on from a scrolled step would drop you into the middle of the next one.
         */
        scrollKey={index}
        headerBackgroundImage={photo}
        contentNegativeSpace={CONTENT_NEGATIVE_SPACE}
        headerContent={<StepMedia height={height * MEDIA_RATIO} />}
        contentHeader={<View style={styles.lip} />}
      >
        <RecipeScreen
          style={{
            ...styles.content,
            paddingBottom: barHeight + theme.spacing[16],
            minHeight: height - (height * MEDIA_RATIO)
          }}
          customGradient={[theme.colors.neutral.subtle, theme.colors.neutral.subtle]}
        >
          {/* Keyed by the step, so moving on plays as an arrival rather than as text swapping. */}
          <m.View
            key={index}
            from={{
              opacity: 0,
              translateX: previousIndex === index ? 0 : previousIndex > index ? -12 : 12,
              translateY: index === 0 && previousIndex === 0 ? 12 : 0,
            }}
            animate={{ opacity: 1, translateX: 0, translateY: 0 }}
            transition={{ type: "timing", duration: 220 }}
            style={{ marginTop: -CONTENT_NEGATIVE_SPACE / 2 }}
          >
            {!step && <PrepCard
              ingredients={ingredients.map((line) => ({
                emoji: line.emoji,
                imageUrl: line.imageUrl,
                name: line.name,
                amount: line.quantity,
                unit: line.unit,
                conversion: line.conversion,
              }))}
            />}
            {step && <StepCard
              position={step.position}
              instruction={step.instruction}
              lines={ingredients}
              /** Scaled with the instruction by `useRecipe`, so an amount in a tip matches the step. */
              hints={step.hints}
              /** The group the step belongs to — "Sauce", "Plate" — when the method has any. */
              title={step.title}
              /**
               * What this step alone calls for, read out of its own sentence. The instruction has
               * already been scaled by `useRecipe`, so the amounts here are the ones the cook is
               * being told to use rather than the ones the recipe was written with.
               */
              ingredients={ingredientsIn(step.instruction, ingredients).map((mention) => ({
                emoji: mention.line.emoji,
                imageUrl: mention.line.imageUrl,
                name: mention.line.name,
                amount: mention.amount,
                unit: mention.unit,
                conversion: mention.line.conversion,
              }))}
              isLast={isLast}
            />}
          </m.View>
        </RecipeScreen>
      </ParallaxScrollView>
      {/*
        * Pinned rather than laid over the photo, because it is the only way out of a screen that
        * covers the whole app — scrolled into a long step, an exit that had drifted away with the
        * header would be a scroll back up before it was a tap.
        */}
      <SafeAreaView edges={{ bottom: "off" }} style={styles.exit} pointerEvents="box-none">
        {/* An empty slot when there is no way out, so the pill keeps its side of the row. */}
        {onClose ? (
          <ButtonIcon elevated variant="neutral-inverted" size="md" onPress={onClose}>
            {X}
          </ButtonIcon>
        ) : <View />}
        <AnimatePresence>
          {index === 0 && servings && <m.View
            from={{ opacity: 0, translateX: "100%" }}
            animate={{ opacity: 1, translateX: "0%" }}
            exit={{ opacity: 0, translateX: "100%" }}
            transition={{ type: "timing", duration: 220 }}
          >
            <ButtonPill
              elevated
              variant="primary"
              leftIcon={Minus}
              rightIcon={Plus}
              onLeftPress={() => servings.onChange(servings.value - 1)}
              onLeftLongPress={() => servings.onChange(MIN_SERVINGS)}
              leftLongPressDelay={SERVINGS_RESET_DELAY}
              onRightPress={() => servings.onChange(servings.value + 1)}
              sideHaptic
              onPress={() => null}
              size="sm"
            >
              {String(servings.value)}
            </ButtonPill>
          </m.View>}
        </AnimatePresence>
      </SafeAreaView>
      <StepBar
        isFirst={isFirst}
        isLast={isLast}
        onPrevious={() => { setIndex((current) => Math.max(0, current - 1)); setPreviousIndex(index) }}
        onNext={() => { setIndex((current) => Math.min(lastIndex, current + 1)); setPreviousIndex(index); }}
        onFinish={onFinish}
        isFinishing={isFinishing}
        finishFailed={finishFailed}
        onHeight={setBarHeight}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    overflow: "hidden",
  },
  /**
   * The rounded strip of content that overlaps the photo, so the two meet on a curve. It paints
   * itself rather than sitting on a parent: a square view behind it would fill the very corners
   * the radius exists to cut out of the photo.
   */
  lip: {
    height: CONTENT_NEGATIVE_SPACE,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.neutral.subtle,
  },
  content: {
    paddingHorizontal: SCREEN_PADDING,
  },
  exit: {
    position: "absolute",
    top: SCREEN_PADDING,
    left: SCREEN_PADDING,
    right: SCREEN_PADDING,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[8],
    justifyContent: "space-between",
  }
});
