import { StyleSheet, View, ViewStyle } from "react-native";

import { theme } from "theme";

import { Image } from "../image";
import { CalendarPlus } from "../icons";
import { PLATE_GAP, PLATE_SIZE, SIDE_SCALE } from "./plate";
import { Button } from "../button";
import { ComponentProps } from "react";

/** Three slots: one in focus and the week continuing either side of it. */
const SLOTS = 3;

type Props = {
  /** The one thing to do here. Worded by the caller: `src/ui/**` does not read translations (ADR 0002). */
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  emptyPlateImageSrc: ComponentProps<typeof Image>["source"];
};

/**
 * The carousel before there is anything to put on it: three empty slots and the way to fill them.
 *
 * Not `PlateCarousel` with placeholder items, and not a disabled one either. A carousel that
 * scrolls invites the user to look for the plate that is further along, and there is none — the
 * whole message here is that the week is unwritten. So this is a plain row laid out to the real
 * carousel's numbers (`PLATE_SIZE`, `PLATE_GAP`): it reads as the same object, settled on its
 * middle slot, rather than as a different component that happens to sit in the same place. The
 * side slots sit a touch larger than the real carousel's `SIDE_SCALE`, so the empty plates either
 * side still read as places to fill rather than receding out of view.
 *
 * The row is wider than any phone and is allowed to overflow, exactly as the real one does — the
 * side slots run off both edges, which is what says the week continues past what is shown.
 *
 * Every slot draws the image the caller passes: the planned week's empty plate, the same one it
 * falls back to for a meal with no photo, so the empty week is drawn in the carousel's own material.
 */
export const PlateCarouselEmpty = ({ label, onPress, emptyPlateImageSrc, style }: Props) => (
  <View style={[styles.container, style]}>
    <View style={styles.row}>
      {Array.from({ length: SLOTS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.slot,
            // The middle slot is the one in focus; its neighbours sit back at the carousel's own scale.
            index === (SLOTS - 1) / 2 ? undefined : { transform: [{ scale: SIDE_SCALE * 1.1 }] },
          ]}
        >
          <Image
            source={emptyPlateImageSrc}
            style={{ width: PLATE_SIZE, height: PLATE_SIZE }}
          />
        </View>
      ))}
    </View>
    <View style={styles.buttonContainer}>
      <Button
        elevated
        variant="primary"
        onPress={onPress}
        leftIcon={CalendarPlus}
      >
        {label}
      </Button>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: PLATE_GAP,
  },
  slot: {
    width: PLATE_SIZE,
    height: PLATE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    position: "absolute",
    bottom: theme.spacing[4],
    justifyContent: "center",
  }
});
