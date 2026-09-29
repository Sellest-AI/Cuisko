import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import { theme } from "theme";

import { Image } from "../image";
import { CalendarPlus } from "../icons";
import { PLATE_GAP, PLATE_SIZE, PlateShadow, SIDE_SCALE, SIDE_TILT, TILT_SHIFT } from "./plate";
import { Button } from "../button";
import { TiltSensor, type Tilt } from "@ui/tilt-sensor";
import { ComponentProps } from "react";

/** Three slots: one in focus and the week continuing either side of it. */
const SLOTS = 3;
const CENTRE = (SLOTS - 1) / 2;

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
 *
 * It tilts and casts shadows by the real carousel's rules too, with the camera held on the middle
 * slot: an empty week that sat flat and still beside a full one would read as a different object.
 */
export const PlateCarouselEmpty = ({ label, onPress, emptyPlateImageSrc, style }: Props) => {
  const tilt: Tilt = {
    shift: useSharedValue(0),
    neutral: useSharedValue<number | null>(null)
  };

  /** The row never scrolls, so the camera stays on the middle slot. */
  const centredSlot = useSharedValue(CENTRE);

  return (
    <View style={[styles.container, style]}>
      <TiltSensor tilt={tilt} maxShift={TILT_SHIFT} />
      <View style={styles.row}>
        {Array.from({ length: SLOTS }, (_, index) => (
          <EmptySlot
            key={index}
            index={index}
            centredSlot={centredSlot}
            tiltShift={tilt.shift}
            imageSrc={emptyPlateImageSrc}
          />
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
};

type EmptySlotProps = {
  index: number,
  centredSlot: SharedValue<number>,
  tiltShift: SharedValue<number>,
  imageSrc: Props["emptyPlateImageSrc"]
};

const EmptySlot = ({ index, centredSlot, tiltShift, imageSrc }: EmptySlotProps) => {
  const isCentre = index === CENTRE;

  /** One transform for both: a second `transform` in the style array would replace this one, not
   *  add to it. The middle slot is the one in focus; its neighbours sit back at the carousel's scale. */
  const slotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tiltShift.value * (isCentre ? 1 : SIDE_TILT) },
      { scale: isCentre ? 1 : SIDE_SCALE * 1.1 }
    ]
  }));

  return (
    <Animated.View style={[styles.slot, slotStyle]}>
      <PlateShadow
        index={index}
        centredSlot={centredSlot}
        slotWidth={1}
        tiltShift={tiltShift}
        shadowStrength={0.2}
      />
      <Image
        source={imageSrc}
        style={{ width: PLATE_SIZE, height: PLATE_SIZE }}
      />
    </Animated.View>
  );
};

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
