import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { MorphIcon, Pause, Play } from "@ui/icons";
import { Pressable } from "@ui/pressable";
import { theme } from "theme";

type Props = {
  /** The step is demonstrated rather than photographed, so it gets a transport control. */
  hasVideo?: boolean;
  /** Measured by the screen, so the card underneath always lands at the same place. */
  height: number;
};

/** How large the play control reads over a full-bleed photo — a disc would fight the image. */
const TRANSPORT_SIZE = 56;

/**
 * What sits on top of the step's photo, and the room the photo gets to be a photo in.
 *
 * The image itself is not here: it is the parallax header's background, so it scales and drifts as
 * the page scrolls. This is the layer over it, and its height is what tells the parallax how tall
 * that header is — the same arrangement as `RecipeHeader` on the recipe's own tabs.
 */
export const StepMedia = ({ hasVideo = false, height }: Props) => {
  /**
   * Local and visual only. There is no player yet — this is the control the real one will drive,
   * kept here so the layout it has to fit into is settled before the media arrives.
   */
  const [playing, setPlaying] = useState(true);

  return (
    <View style={[styles.media, { height }]} pointerEvents="box-none">
      {hasVideo && (
        <View style={styles.transport} pointerEvents="box-none">
          <Pressable onPress={() => setPlaying((on) => !on)}>
            <MorphIcon
              icon={playing ? Pause : Play}
              size={TRANSPORT_SIZE}
              color={theme.colors.white}
            />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  /**
   * Transparent, and sized rather than filled: anything painted here would cover the photo the
   * parallax header is drawing underneath it.
   */
  media: { width: "100%" },
  /**
   * Centres the control over the photo. A box around the icon rather than a pressable filling the
   * frame: `Pressable` hands its own layout to the view it wraps, so an absolute fill there would
   * pin the glyph to the corner instead of the middle.
   */
  transport: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
