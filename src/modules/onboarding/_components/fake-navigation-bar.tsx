import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearTransition } from "react-native-reanimated";

import { ButtonPill } from "@ui/button-pill";
import { Camera, Mic, MorphIcon, SendHorizontal } from "@ui/icons";
import { Input } from "@ui/input";
import { AnimatePresence, m } from "@ui/motion";
import { Text } from "@ui/text";
import { colors, theme } from "theme";
import { useTranslations } from "translations";

import { Hint } from "./hint";
import { LinearGradient } from "expo-linear-gradient";

/** One character this often: quick enough not to be a wait, slow enough to read as typing. */
const TYPE_MS = 10;
/** The typed line rests this long before it is sent, so the eye catches it whole. */
const SEND_DELAY_MS = 240;
/** The real bar's glyph size, so the two read as the same control. */
const ICON_SIZE = 20;
/** A sent chip slides to the end of the rail rather than jumping, and its neighbours close up. */
const CHIP_MOVE = LinearTransition.duration(260);
/** How far the bar sinks as it leaves: its own height, so it goes under the step bar, not beside it. */
const LEAVE_TRAVEL = 128;

type Props = {
  /** Already translated: what each chip says, and what the bar types when it is tapped. */
  hints: readonly string[];
  /** Indexes already sent, drawn spent and no longer tappable. */
  used: readonly number[];
  /** Called once the hint has typed itself out, as Enter would be on the real bar. */
  onSend: (index: number) => void;
  /**
   * Off once the screen no longer needs the bar, so the next move is the only thing left to look
   * at: it sinks and fades rather than vanishing.
   */
  visible?: boolean;
  style?: ViewStyle;
};

/**
 * The navigation bar as the onboarding shows it: the same input shell, and a rail of hints above
 * it. Tapping a hint types it into the bar, letter by letter, then sends it, which is exactly the
 * gesture the real bar asks for, done once for the user so they have seen it work.
 *
 * @limitation A look-alike, not the real bar. **Accepted because** the real one classifies what it
 * is given through an action and writes to the household's stock, and a sandboxed mode of it would
 * thread "onboarding" through the navigation module. **Until fixed**, a change to the real bar's
 * look has to be copied here by hand. **The fix** is to lift the bar's visual shell into `@ui` and
 * have both draw it.
 */
export const FakeNavigationBar = ({ hints, used, onSend, visible = true, style }: Props) => {
  const t = useTranslations("Navigation");
  const [typing, setTyping] = useState<{ index: number; length: number } | null>(null);

  const text = typing ? hints[typing.index]!.slice(0, typing.length) : "";
  const isTyped = typing !== null && typing.length >= hints[typing.index]!.length;

  useEffect(() => {
    if (!typing) return;

    if (!isTyped) {
      const timer = setTimeout(() => setTyping({ ...typing, length: typing.length + 1 }), TYPE_MS);

      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      onSend(typing.index);
      setTyping(null);
    }, SEND_DELAY_MS);

    return () => clearTimeout(timer);
  }, [typing, isTyped, onSend]);

  /** The first hint not yet sent: the one that pulses. */
  const nextHint = hints.findIndex((_, index) => !used.includes(index));

  /**
   * The rail's order: what is left to tap first, then what was sent, in the order it was. A chip
   * goes to the end once it is sent, not when it is tapped: its paw goes on the tap, and a chip
   * already sliding away would take the paw along for a frame or two before the paw heard it was
   * off. By the send the paw is long gone, and the next chip is under the thumb all the same.
   */
  const order = [...hints.keys()].filter((index) => !used.includes(index)).concat(used);

  return (
    <AnimatePresence>
      {visible && (
        <m.View
          style={[styles.container, style]}
          from={{ opacity: 0, translateY: LEAVE_TRAVEL }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: LEAVE_TRAVEL }}
          transition={{ type: "timing", duration: 300 }}
        >
          <View
            style={{
              position: "absolute",
              bottom: -270,
              height: 300,
              left: -100,
              right: -100,
              backgroundColor: colors.background
            }}
          />
          <LinearGradient
            pointerEvents="none"
            style={[{ position: "absolute", bottom: 0, left: 0, right: 0, height: 240 }]}
            colors={[colors.transparent.light, colors.background, colors.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railScroll}
          >
            {order.map((index) => {
              const hint = hints[index]!;
              const isUsed = used.includes(index);

              return (
                <Hint key={hint} active={!typing && index === nextHint} layout={CHIP_MOVE}>
                  <ButtonPill
                    size="lg"
                    variant="neutral"
                    disabled={isUsed || typing !== null}
                    onPress={() => setTyping({ index, length: 0 })}
                    style={isUsed ? styles.used : undefined}
                  >
                    {hint}
                  </ButtonPill>
                </Hint>
              );
            })}
          </ScrollView>
          <Input
            elevated
            leftIcon={Camera}
            centerContent={
              <Text.Base color={typing ? colors.foreground : colors.muted} numberOfLines={1} style={styles.text}>
                {typing ? text : t("ask_anything").slice(0, 15).trim().concat("…")}
              </Text.Base>
            }
            rightContent={
              <MorphIcon icon={typing ? SendHorizontal : Mic} size={ICON_SIZE} color={colors.foreground} />
            }
            style={styles.input}
          />
        </m.View>
      )}
    </AnimatePresence>
  );
};

const styles = StyleSheet.create({
  container: { gap: theme.spacing[8] },
  /** Bleeds to the screen edges, so a chip scrolled off reads as more to come, not as clipped. */
  railScroll: { marginHorizontal: -theme.spacing[16] },
  /** Room for the pulse ring, which would otherwise be cut by the scroll view's bounds. */
  rail: { gap: theme.spacing[8], paddingHorizontal: theme.spacing[16], paddingVertical: theme.spacing[8] },
  used: { opacity: 0.4 },
  text: { flex: 1 },
  input: { width: "100%" },
});
