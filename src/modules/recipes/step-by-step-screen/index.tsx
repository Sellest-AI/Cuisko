import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { formatQuantity } from "@shared/ingredients";

import { ButtonIcon } from "@ui/button-icon";
import { ButtonPill } from "@ui/button-pill";
import { Minus, Plus, X } from "@ui/icons";
import { AnimatePresence, m } from "@ui/motion";
import { ParallaxScrollView } from "@ui/parallax-scroll-view";
import { SafeAreaView } from "@ui/safe-area-view";
import { theme } from "theme";

import { useUnitLabel } from "~/hooks/useUnitLabel";
import { NAVIGATION_BAR_OFFSET } from "~/modules/navigation/constants";

import { RecipeScreen } from "../_components/recipe-screen";
import { useCookRecipe } from "../_hooks/useCookRecipe";
import { useRecipe } from "../_hooks/useRecipe";
import { flattenSteps } from "../_model/detail";
import { ingredientsIn } from "../_model/quantities";
import { CONTENT_NEGATIVE_SPACE, COVER_PLACEHOLDER, SCREEN_PADDING } from "../constants";
import { StepBar } from "./bar";
import { PrepCard, StepCard } from "./card";
import { StepMedia } from "./media";

/** How much of the screen the photo takes at rest, leaving the card the rest of it. */
const MEDIA_RATIO = 0.4;

type Props = {
  /** The recipe to cook. The route's, like `onClose` — a screen cannot know what opened it. */
  id?: string;
  /** The route's, because a screen cannot know what it was opened from. */
  onClose: () => void;
  /** Where the dish goes once the server has taken the cook: the route's too, for the same reason. */
  onCooked: () => void;
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
export const StepByStepScreen = ({ id, onClose, onCooked }: Props) => {
  const { height } = useWindowDimensions();
  const unit = useUnitLabel();
  const { recipe, ingredients, servings, setServings } = useRecipe(id);
  const { cook, isCooking, failed } = useCookRecipe();
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);

  /** The bar overlays the page; until it has been laid out, assume the height every other bar has. */
  const [barHeight, setBarHeight] = useState(NAVIGATION_BAR_OFFSET);

  /**
   * The method as one unbroken run, because a cook at a hob is walking steps rather than reading
   * groups — and `flattenSteps` is what keeps "step 3" meaning the same thing here as on the tab.
   */
  const steps = flattenSteps(recipe?.instructions ?? []);

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
          <ButtonIcon elevated variant="neutral-inverted" size="md" onPress={onClose}>
            {X}
          </ButtonIcon>
        </SafeAreaView>
      </View>
    );
  }

  /**
   * The photo behind every step is the recipe's cover, until a step has media of its own.
   *
   * Nothing records one yet: `recipeSteps` does not exist, and reading a picture or a clip out of
   * the instruction's words is a paid lookup this slice does not make. So the header falls back
   * the way the recipe's own chrome does — the cover, or the placeholder while there is no cover
   * either — and `StepMedia` keeps its transport for the day a step brings a video.
   */
  const photo = recipe?.coverImageLargeUrl ?? COVER_PLACEHOLDER;

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
                quantity: formatQuantity(line.quantity, line.unit, unit),
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
                quantity: formatQuantity(mention.amount, mention.unit, unit),
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
        <ButtonIcon elevated variant="neutral-inverted" size="md" onPress={onClose}>
          {X}
        </ButtonIcon>
        <AnimatePresence>
          {index === 0 && <m.View
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
              onLeftPress={() => setServings(servings - 1)}
              onRightPress={() => setServings(servings + 1)}
              onPress={() => null}
              size="sm"
            >
              {String(servings)}
            </ButtonPill>
          </m.View>}
        </AnimatePresence>
      </SafeAreaView>
      <StepBar
        isFirst={isFirst}
        isLast={isLast}
        onPrevious={() => { setIndex((current) => Math.max(0, current - 1)); setPreviousIndex(index) }}
        onNext={() => { setIndex((current) => Math.min(lastIndex, current + 1)); setPreviousIndex(index); }}
        /**
         * The screen leaves only once the server has agreed: a modal dismissed over a write that
         * then fails would leave the cook believing their cellar moved when it did not.
         */
        onFinish={async () => { if (recipe && (await cook(recipe.id, servings))) onCooked(); }}
        isFinishing={isCooking}
        finishFailed={failed}
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
