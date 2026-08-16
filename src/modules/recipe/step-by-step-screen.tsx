import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { Minus, Plus, X } from "@ui/icons";
import { m } from "@ui/motion";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";

import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { RecipeScreen } from "./_components/recipe-screen";
import { CONTENT_NEGATIVE_SPACE, SCREEN_PADDING } from "./constants";
import { StepBar } from "./step-by-step-screen.bar";
import { StepCard } from "./step-by-step-screen.card";
import { StepMedia } from "./step-by-step-screen.media";

/** Placeholder recipe, until `_hooks/` exists to fetch a real one. */
const STEPS = [
  {
    duration: "15 minutes",
    instruction: "Soften the onions and bacon in the pan, then drain them well.",
    photo:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&auto=format&fit=crop&w=1170&q=80",
    ingredients: [
      { emoji: "🧅", name: "Onions", quantity: "2 pcs" },
      { emoji: "🥓", name: "Bacon", quantity: "200 g" },
      { emoji: "🫒", name: "Oil", quantity: "1 tbsp" },
      { emoji: "🧂", name: "Salt", quantity: "1 pinch" },
    ],
  },
  {
    duration: "5 minutes",
    instruction: "Cook down the tomatoes 🍅 and the carrots 🥕.",
    photo:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?ixlib=rb-4.0.3&auto=format&fit=crop&w=1170&q=80",
    hasVideo: true,
    ingredients: [
      { emoji: "🍅", name: "Tomatoes", quantity: "500 g" },
      { emoji: "🥕", name: "Carrots", quantity: "300 g" },
    ],
  },
  {
    duration: "10 minutes",
    instruction: "Roll out the dough, spread the sauce, then add the mozzarella.",
    photo:
      "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?ixlib=rb-4.0.3&auto=format&fit=crop&w=1170&q=80",
    ingredients: [
      { emoji: "🧀", name: "Mozzarella", quantity: "150 g" },
      { emoji: "🌿", name: "Basil", quantity: "6 leaves" },
    ],
  },
  {
    duration: "8 minutes",
    instruction: "Bake at 250°C until the crust turns golden, then serve.",
    photo:
      "https://images.unsplash.com/photo-1595854341625-f33ee10dbf94?ixlib=rb-4.0.3&auto=format&fit=crop&w=1170&q=80",
    ingredients: [],
  },
];

/** How much of the screen the photo takes at rest, leaving the card the rest of it. */
const MEDIA_RATIO = 0.4;

type Props = {
  /** The route's, because a screen cannot know what it was opened from. */
  onClose: () => void;
};

/**
 * The recipe, one step at a time, for someone standing at a hob rather than reading a page.
 *
 * Deliberately not one of the recipe's tabs: it opens over them, carries its own photo per step,
 * and replaces the chrome's navigation with a transport. Nothing about it survives a tab switch,
 * which is the point — this is a session, not a view.
 *
 * It sits in the same parallax container the tabs do, so the photo behaves the way it does
 * everywhere else in the recipe: it drifts and scales under the content instead of scrolling off,
 * and a step whose ingredients run past the fold reads as one page rather than two panes.
 */
export const StepByStepScreen = ({ onClose }: Props) => {
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);

  /** The bar overlays the page; until it has been laid out, assume the height every other bar has. */
  const [barHeight, setBarHeight] = useState(NAVIGATION_BAR_OFFSET);

  const step = STEPS[index]!;

  return (
    <View style={styles.screen}>
      <ParallaxScrollView
        /**
         * Each step opens at its own top. The scroll container outlives all of them, so without
         * this, moving on from a scrolled step would drop you into the middle of the next one.
         */
        scrollKey={index}
        headerBackgroundImage={step.photo}
        contentNegativeSpace={CONTENT_NEGATIVE_SPACE}
        headerContent={<StepMedia hasVideo={step.hasVideo} height={height * MEDIA_RATIO} />}
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
            <StepCard
              position={index + 1}
              duration={step.duration}
              instruction={step.instruction}
              ingredients={step.ingredients}
            />
          </m.View>
        </RecipeScreen>
      </ParallaxScrollView>
      {/*
        * Pinned rather than laid over the photo, because it is the only way out of a screen that
        * covers the whole app — scrolled into a long step, an exit that had drifted away with the
        * header would be a scroll back up before it was a tap.
        */}
      <SafeAreaView edges={{ bottom: "off" }} style={styles.exit} pointerEvents="box-none">
        <ButtonIcon elevated variant="neutral-inverted" size="md" onPress={onClose}>
          {X}
        </ButtonIcon>
        <ButtonPill
          elevated
          variant="primary"
          leftIcon={Minus}
          rightIcon={Plus}
          // Set the serving size
          onLeftPress={() => { }}
          onRightPress={() => { }}
          onPress={() => null}
          size="sm"
        >
          5
        </ButtonPill>
      </SafeAreaView>
      <StepBar
        isFirst={index === 0}
        isLast={index === STEPS.length - 1}
        onPrevious={() => { setIndex((current) => Math.max(0, current - 1)); setPreviousIndex(index) }}
        onNext={() => { setIndex((current) => Math.min(STEPS.length - 1, current + 1)); setPreviousIndex(index); }}
        /**
         * Placeholder: taking the ingredients back out of the cellar is a mutation, and this module
         * has no `_hooks/` yet. Until it does, finishing only closes the session.
         */
        onFinish={onClose}
        onHeight={setBarHeight}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    alignItems: "center",
    gap: theme.spacing[8],
    justifyContent: "space-between",
  }
});
