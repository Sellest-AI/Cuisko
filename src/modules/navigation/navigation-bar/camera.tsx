import { useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { CameraView } from "expo-camera";
import { launchImageLibraryAsync } from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlurView } from "@ui/blur-view";
import { ButtonIcon } from "@ui/button-icon";
import { Image, X } from "@ui/icons";
import type { Frame } from "@ui/input";
import { Pressable } from "@ui/pressable";
import { theme } from "theme";

/**
 * The shutter's ring: frosted over the live picture on iOS and web, a plain translucent disc on
 * Android. There the preview is a `SurfaceView` (`expo-camera` leaves CameraX's default), which a
 * blur cannot copy, so a `BlurView` over it would show nothing but its faint fill.
 */
const Shutter = Platform.OS === "android" ? View : BlurView;

const OPEN_MS = 420;
const CLOSE_MS = 320;
const SIDE_MARGIN = theme.spacing[16];
/** How much of its layer's height the viewfinder takes: its top sits at (1 − share) of the layer. */
const VIEWFINDER_SHARE = 0.62;
const VIEWFINDER_RADIUS = Platform.select({ default: 36, ios: 48 });
const SHUTTER_SIZE = 72;
/** The photo picker's button: a `size="md"` `ButtonIcon`'s width, and its gap to the shutter. */
const PICK_BUTTON_SIZE = 52;
const PICK_BUTTON_GAP = 48;

type Props = {
  /** Where the camera button is — the circle this grows out of, and shrinks back into. */
  origin: Frame,
  /**
   * Where the button is now. The bar moves while the camera is up — the keyboard it was opened over
   * goes down — so the way back is measured when it starts, not taken from `origin`.
   */
  measureOrigin: () => Promise<Frame>,
  /** A photo was taken, or picked from the phone: its local file URI. The sheet closes itself right after. */
  onCapture: (uri: string) => void,
  /** The close animation has finished, so the caller can stop rendering this. */
  onClosed: () => void,
};

/**
 * The camera, opened out of the navigation bar's round camera button and folded back into it.
 *
 * One `progress` value drives everything: the box travels from the button's frame to the
 * viewfinder's and its corners from a circle's to a sheet's. The camera is mounted from the first
 * frame, so it is warm by the time the box has grown, and fades in over the button's own surface
 * rather than popping in. The box carries no icon of its own: a copy of the camera glyph at a
 * different size from the button's read as the icon scaling, so only the surface travels and the
 * content fades in on it.
 *
 * The preview is laid out at the viewfinder's final size and centred in the growing box, so it is
 * cropped by it rather than stretched — the picture never squeezes on the way.
 *
 * Mounted means open: the caller renders this while a camera is wanted and drops it on `onClosed`.
 */
export const NavigationBarCamera = ({ origin, measureOrigin, onCapture, onClosed }: Props) => {
  const insets = useSafeAreaInsets();
  const root = useRef<View>(null);
  /**
   * Where this layer sits in the window, and how big it is. **The camera is not always drawn at the
   * window's origin:** the assistant is a native sheet that renders its own bar, so the camera
   * mounts inside it, lower and further in than the screen. Every frame it is handed (the button's,
   * measured in the window) and every size it aims for is translated into this layer's own space,
   * or it lands a sheet's offset too low and is cut off by the sheet.
   */
  const [layer, setLayer] = useState<Frame>();
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) =>
    root.current?.measureInWindow((x, y) => setLayer({ x, y, width: layout.width, height: layout.height }));
  const local = (frame: Frame): Frame => ({ ...frame, x: frame.x - (layer?.x ?? 0), y: frame.y - (layer?.y ?? 0) });
  const { width, height } = layer ?? { width: 0, height: 0 };
  const progress = useSharedValue(0);
  /** Starts as where the button was pressed; replaced by where it is when the camera folds back. */
  const from = useSharedValue<Frame>(origin);
  const cameraRef = useRef<CameraView>(null);
  const isClosing = useRef(false);

  /**
   * The viewfinder ends `bottomGap` above the layer's bottom, wherever the bar is: its bottom edge is
   * set from the bottom, and the top follows from the share. The gap is per platform. On Android it
   * is a margin above the safe area. On iOS it is `insets.bottom - 16`, tuned on a device, so the
   * viewfinder sits level with the sheet's own inset and not above it.
   */
  const bottomGap = insets.bottom + Platform.select({ default: SIDE_MARGIN, ios: -theme.spacing[16] });
  const viewfinderHeight = height * VIEWFINDER_SHARE - bottomGap;
  const target = {
    x: SIDE_MARGIN,
    y: height * (1 - VIEWFINDER_SHARE),
    width: width - SIDE_MARGIN * 2,
    height: viewfinderHeight,
  };

  /** Opens once the layer is measured, so the box never starts from a frame in the wrong space. */
  const isMeasured = layer !== undefined;
  useEffect(() => {
    if (!isMeasured) return;
    from.set(local(origin));
    progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the layer is first measured
  }, [isMeasured]);

  const close = async () => {
    if (isClosing.current) return;
    isClosing.current = true;
    const now = await measureOrigin();
    // Nothing found, as when the button is not mounted: fold back to where it was.
    if (now.width > 0) from.set(local(now));
    progress.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(onClosed);
    }));
  };

  const takePhoto = async () => {
    if (isClosing.current) return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
    if (!photo) return;
    onCapture(photo.uri);
    close();
  };

  /**
   * The system photo picker, not a gallery of our own: it needs no storage permission (Android shows
   * its Photo Picker, backported below 13 through Play services; iOS its PHPicker), which is what
   * Google Play requires of an app that only ever takes one image. Cancelled, the camera stays open.
   */
  const pickPhoto = async () => {
    if (isClosing.current) return;
    const result = await launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const picked = result.assets?.[0];
    if (!picked) return;
    onCapture(picked.uri);
    close();
  };

  const box = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [from.get().x, target.x]),
    top: interpolate(progress.value, [0, 1], [from.get().y, target.y]),
    width: interpolate(progress.value, [0, 1], [from.get().width, target.width]),
    height: interpolate(progress.value, [0, 1], [from.get().height, target.height]),
    borderRadius: interpolate(progress.value, [0, 1], [from.get().height / 2, VIEWFINDER_RADIUS]),
  }));
  const preview = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.25, 0.7], [0, 1], "clamp") }));
  const controls = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.75, 1], [0, 1], "clamp") }));

  return (
    <View ref={root} onLayout={onLayout} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {isMeasured && <Animated.View style={[styles.box, box]}>
        <Animated.View
          style={[
            styles.preview,
            // Pinned to the final size and centred, so the growing box crops it.
            { width: target.width, height: target.height, marginLeft: -target.width / 2, marginTop: -target.height / 2 },
            preview,
          ]}
        >
          <CameraView ref={cameraRef} facing="back" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, controls]} pointerEvents="box-none">
          <View style={styles.closeButton}>
            <ButtonIcon
              elevated
              variant="neutral"
              size="md"
              onPress={close}
              // White on the frosted iOS button. On Android its blur cannot sample the preview, so the
              // disc is only a faint light fill, and the glyph keeps the variant's own dark colour.
              iconColor={Platform.select({ ios: "white", default: undefined })}
              iconSize={24}
            >
              {X}
            </ButtonIcon>
          </View>
          <View style={styles.pickButton}>
            <ButtonIcon
              elevated
              variant="neutral"
              size="md"
              onPress={pickPhoto}
              iconColor={Platform.select({ ios: "white", default: undefined })}
              iconSize={24}
            >
              {Image}
            </ButtonIcon>
          </View>
          <Pressable haptic onPress={takePhoto} style={styles.shutterContainer}>
            <Shutter style={styles.shutter}>
              <View style={styles.shutterInner} />
            </Shutter>
          </Pressable>
        </Animated.View>
      </Animated.View>}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: theme.colors.background,
    boxShadow: [{ offsetX: 0, offsetY: -6, blurRadius: 64, spreadDistance: 10, color: "rgba(0, 0, 0, 0.2)" }],
  },
  preview: {
    position: "absolute",
    left: "50%",
    top: "50%",
  },
  closeButton: {
    position: "absolute",
    top: theme.spacing[20],
    left: theme.spacing[20],
  },
  pickButton: {
    position: "absolute",
    alignSelf: "center",
    /** Align the button with the shutter. */
    bottom: theme.spacing[20] + ((SHUTTER_SIZE + 10) / 2) - (PICK_BUTTON_SIZE / 2),
    /** Space the button from the shutter. */
    marginLeft: (SHUTTER_SIZE + 10) + PICK_BUTTON_SIZE + PICK_BUTTON_GAP,
  },
  shutterContainer: {
    position: "absolute",
    bottom: theme.spacing[20],
    alignSelf: "center",
    width: SHUTTER_SIZE + 10,
    height: SHUTTER_SIZE + 10,
  },
  shutter: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: SHUTTER_SIZE - 10,
    height: SHUTTER_SIZE - 10,
    borderRadius: theme.radius.full,
    backgroundColor: "#FFFFFF",
  },
});
