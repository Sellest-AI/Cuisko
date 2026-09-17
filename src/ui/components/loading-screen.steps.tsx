import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { CircleCheck, CircleDashed, Loader, MorphIcon } from "@ui/icons";
import { AnimatePresence, m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";

type Props = {
  steps: readonly string[];
  /** Ever-increasing; the step shown is `steps[active % steps.length]`. */
  active: number;
  /** The work is done: the active row stops spinning and is ticked off like the ones above it. */
  finished?: boolean;
};

const ROW_HEIGHT = 40;
const ICON_SIZE = 18;

/** Rows kept on screen around the active one: two finished above it, one waiting below. */
const ABOVE = 2;
const BELOW = 1;

/** Fades with distance from the active row, so the list reads as rolling past rather than cut off. */
const OPACITY_BY_OFFSET: Record<number, number> = { [-2]: 0.25, [-1]: 0.6, 0: 1, 1: 0.35 };

const TRANSITION = { type: "timing", duration: 500 } as const;

/** The row a step leaves towards on its way off the top. Hoisted for the same reason as the rest. */
const EXIT = { opacity: 0, translateY: -ROW_HEIGHT } as const;

/**
 * The step list, rolling up one row each time `active` moves.
 *
 * Rows are keyed by their absolute index, never by `% steps.length`: after the last step the
 * first one mounts below as a new row instead of the old row jumping back to the top, which is
 * what makes the loop seamless.
 */
export const LoadingSteps = ({ steps, active, finished = false }: Props) => {
  if (steps.length === 0) return null;

  const rows = Array.from({ length: ABOVE + 1 + BELOW }, (_, slot) => active - ABOVE + slot).filter(
    (index) => index >= 0,
  );

  return (
    <View style={styles.list}>
      <AnimatePresence>
        {rows.map((index) => (
          <StepRow
            key={index}
            offset={index - active}
            label={steps[index % steps.length] ?? ""}
            finished={finished}
          />
        ))}
      </AnimatePresence>
    </View>
  );
};

/**
 * One row, memoised — and the memo is the point rather than a saving.
 *
 * Moti rebuilds its animated style whenever `from`, `animate` or `transition` change identity, and
 * an object literal written in the parent's JSX changes identity on every render of the parent.
 * The list re-renders each time a step advances, which would hand every row a fresh target
 * mid-flight. Same trap the tunnel's drifting plates fell into, where it froze them outright.
 */
const StepRow = memo(
  ({ offset, label, finished }: { offset: number; label: string; finished: boolean }) => {
    const top = (offset + ABOVE) * ROW_HEIGHT;

    /** Nothing comes after the last step, so the row waiting below fades out rather than hanging on. */
    const opacity = finished && offset > 0 ? 0 : (OPACITY_BY_OFFSET[offset] ?? 0);

    return (
      <m.View
        style={styles.row}
        from={{ opacity: 0, translateY: top + ROW_HEIGHT }}
        animate={{ opacity, translateY: top }}
        exit={EXIT}
        transition={TRANSITION}
      >
        <StepIcon offset={offset} finished={finished} />
        <Text.Base color={offset === 0 ? colors.foreground : colors.muted}>{label}</Text.Base>
      </m.View>
    );
  },
);

StepRow.displayName = "StepRow";

const StepIcon = ({ offset, finished }: { offset: number; finished: boolean }) => {
  if (offset === 0 && !finished) return <Loader size={ICON_SIZE} color={colors.foreground} />;

  return offset <= 0 ? (
    <MorphIcon icon={CircleCheck} size={ICON_SIZE} color={colors.primary.base} />
  ) : (
    <MorphIcon icon={CircleDashed} size={ICON_SIZE} color={colors.muted} />
  );
};

const styles = StyleSheet.create({
  list: {
    alignSelf: "stretch",
    height: (ABOVE + 1 + BELOW) * ROW_HEIGHT,
    overflow: "hidden",
  },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[8],
  },
});
